import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma.js";
import { getEmailProvider } from "../lib/emailProvider.js";
import { isUnderDailyCap } from "../lib/sendCap.js";
import { isAccountUnderDailyCap } from "../lib/accountSendCap.js";
import { resolveEmailAccount } from "../lib/accountRouting.js";
import { isLeadEligibleForCadenceStep } from "../lib/cadenceEligibility.js";
import { unsubscribeUrlFor, interestButtonHtml, plainTextToHtml } from "../lib/leadSender.js";
import { injectTrackingPixel, wrapLinksForClickTracking } from "../lib/emailTracking.js";

const QUEUE_NAME = "cadence-steps";

let connection = null;
let queue = null;
let worker = null;

// Redis is optional in local/dev: without REDIS_URL the API still serves
// immediate sends (POST /leads/:id/send), it just can't schedule delayed
// follow-ups or enforce the daily rate cap.
export function isQueueEnabled() {
  return Boolean(process.env.REDIS_URL);
}

function ensureConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getCadenceQueue() {
  if (!isQueueEnabled()) {
    return null;
  }
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: ensureConnection() });
  }
  return queue;
}

export async function enqueueCadenceStep({ leadId, campaignId, stepIndex, subject, body, delayMs }) {
  const q = getCadenceQueue();
  if (!q) {
    throw new Error("Cadence queue is disabled (REDIS_URL not set).");
  }
  await q.add(
    "send-step",
    { leadId, campaignId, stepIndex, subject, body },
    {
      delay: delayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 }
    }
  );
}

export function startCadenceWorker() {
  if (!isQueueEnabled()) {
    console.log("[cadence-worker] REDIS_URL not set — worker not started.");
    return null;
  }
  if (worker) {
    return worker;
  }

  const workerConnection = ensureConnection();

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { leadId, campaignId, subject, body } = job.data;
      const lead = await prisma.emailLead.findUniqueOrThrow({ where: { id: leadId } });
      const campaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { emailAccount: true } });
      // Resolved per-job, not once at worker startup — a global provider
      // grabbed once would ignore per-lead country routing (a match on
      // EmailLead.country overrides the campaign's assigned EmailAccount,
      // see accountRouting.js) and silently send every cadence step through
      // the same default mailbox regardless of the lead's own country.
      const resolvedAccount = await resolveEmailAccount(lead, campaign);
      const emailProvider = getEmailProvider(resolvedAccount);

      // The actual "stop the no-reply cadence once they reply" check — a
      // job that was enqueued 3 days ago for "Day 3 follow-up" still fires
      // at its scheduled time regardless of what happened since; this is
      // what makes it skip instead of sending an unwanted reminder to
      // someone who already replied (or bounced/unsubscribed) in between.
      const { eligible, reason } = isLeadEligibleForCadenceStep(lead);
      if (!eligible) {
        console.log(`[cadence-worker] skipping step for lead ${leadId}: ${reason}`);
        await prisma.emailActivityLog.create({
          data: {
            leadId,
            kind: "SEND_BLOCKED",
            title: `Follow-up skipped: ${reason}`,
            detail: `"${subject}" was not sent — ${reason}.`
          }
        });
        return;
      }

      const withinCap = await isUnderDailyCap(campaign);
      if (!withinCap) {
        // TODO: this only retries a few times over ~minutes (see `attempts`/
        // `backoff` on the queue add above), not until the cap actually
        // resets tomorrow. A real implementation should re-enqueue with an
        // explicit delay to next-midnight-UTC instead of relying on the
        // default retry policy.
        throw new Error("Daily send cap reached for this campaign.");
      }

      const accountWithinCap = await isAccountUnderDailyCap(resolvedAccount);
      if (!accountWithinCap) {
        // Same TODO as above: only retries for a few minutes, not until
        // tomorrow's reset.
        throw new Error(`Daily send cap reached for mailbox "${resolvedAccount.label}".`);
      }

      // The activity row has to exist *before* sending — open/click tracking
      // and the "I'm Interested" button both embed this row's own id in
      // their URLs. Previously this only got created *after* a successful
      // send, which also meant these cadence emails went out as bare plain
      // text with no HTML at all: no open/click tracking, no unsubscribe
      // header, and no way to add the Interested button — unlike every
      // other send path in this app (see leadSender.js's sendRawEmail/
      // sendTemplateEmail, which this now mirrors).
      const pendingActivity = await prisma.emailActivityLog.create({
        data: { leadId, kind: "BRANCH_EMAIL_SENT", title: subject, detail: "Sending…", emailAccountId: resolvedAccount?.id ?? null }
      });

      const unsubscribeUrl = unsubscribeUrlFor(leadId);
      const htmlWithClickTracking = wrapLinksForClickTracking(
        plainTextToHtml(body) + interestButtonHtml(leadId),
        pendingActivity.id,
        { skipUrl: unsubscribeUrl }
      );
      const html = injectTrackingPixel(htmlWithClickTracking, pendingActivity.id);

      const { providerMessageId } = await emailProvider.send({
        to: lead.email,
        subject,
        body,
        html,
        unsubscribeUrl,
        replyTo: campaign.replyTo
      });

      await prisma.emailActivityLog.update({
        where: { id: pendingActivity.id },
        data: { detail: `Sent via ${emailProvider.name} provider (message id ${providerMessageId}).` }
      });
    },
    { connection: workerConnection }
  );

  worker.on("failed", (job, err) => {
    console.error(`[cadence-worker] job ${job?.id} failed:`, err);
  });

  return worker;
}
