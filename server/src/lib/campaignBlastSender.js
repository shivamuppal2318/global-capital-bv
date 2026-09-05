import { prisma } from "./prisma.js";
import { getEmailProvider } from "./emailProvider.js";
import { fillMergeFields } from "./renderTemplate.js";
import { isUnderDailyCap } from "./sendCap.js";
import { isAccountUnderDailyCap } from "./accountSendCap.js";
import { resolveEmailAccount } from "./accountRouting.js";
import { unsubscribeUrlFor, appendInterestButton } from "./leadSender.js";
import { injectTrackingPixel, wrapLinksForClickTracking } from "./emailTracking.js";
import { checkSpamSignals } from "./spamCheck.js";

// The one real "send this campaign's own composed content to this lead"
// function — called both by POST /:id/send-now's synchronous no-queue
// fallback and by the BullMQ worker's "send-blast" job, so the two paths
// can't drift apart. Deliberately NOT built on top of
// isLeadEligibleForCadenceStep (queue/cadenceEligibility.js): that check
// skips any lead who already replied, which is correct for a "stop nagging
// once they respond" cadence but wrong here — a lead who replied
// "interested" to an earlier email should still receive a fresh one-time
// campaign blast.

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function sendCampaignBlastEmail(leadId, campaignId) {
  const lead = await prisma.emailLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    throw httpError(404, "Lead not found");
  }
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, include: { emailAccount: true } });
  if (!campaign) {
    throw httpError(404, "Campaign not found");
  }
  if (!campaign.subject || !campaign.bodyHtml) {
    throw httpError(400, `"${campaign.name}" has no composed email content yet.`);
  }

  if (lead.unsubscribed) {
    throw httpError(409, `${lead.name} has unsubscribed; suppressing send.`);
  }
  if (lead.bounced) {
    throw httpError(409, `${lead.name}'s address previously ${lead.bounceKind?.toLowerCase() ?? "hard"}-bounced; suppressing send.`);
  }

  const withinCap = await isUnderDailyCap(campaign);
  if (!withinCap) {
    throw httpError(429, `Daily send cap (${campaign.dailyLimit}) reached for campaign "${campaign.name}". Try again tomorrow.`);
  }

  // Resolved per-send, not once for the whole batch — a country match (see
  // accountRouting.js) can route different leads in the same blast through
  // different mailboxes.
  const resolvedAccount = await resolveEmailAccount(lead, campaign);

  const accountWithinCap = await isAccountUnderDailyCap(resolvedAccount);
  if (!accountWithinCap) {
    throw httpError(429, `Daily send cap (${resolvedAccount.dailyLimit}) reached for mailbox "${resolvedAccount.label}". Try again tomorrow.`);
  }

  const unsubscribeUrl = unsubscribeUrlFor(lead.id);
  const mergeFields = { leadName: lead.name, company: lead.company, email: lead.email, unsubscribeUrl };
  const subject = fillMergeFields(campaign.subject, mergeFields);
  const bodyHtml = fillMergeFields(campaign.bodyHtml, mergeFields);
  const warnings = checkSpamSignals({ subject, body: bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });

  // The activity row has to exist before sending — open/click tracking
  // embeds this row's own id (same reason as leadSender.js/cadenceQueue.js).
  const pendingActivity = await prisma.emailActivityLog.create({
    data: { leadId: lead.id, kind: "CAMPAIGN_BLAST_SENT", title: subject, detail: "Sending…", emailAccountId: resolvedAccount?.id ?? null }
  });

  // Same one-click "I'm Interested" button every cadence-step email already
  // gets (see cadenceQueue.js) — a much more reliable interest signal than
  // waiting for the recipient to type a matching reply. Appended only to
  // the tracked HTML, not the plain-text body sent alongside it.
  const trackedHtml = injectTrackingPixel(
    wrapLinksForClickTracking(appendInterestButton(bodyHtml, lead.id), pendingActivity.id, { skipUrl: unsubscribeUrl }),
    pendingActivity.id
  );

  // If the actual send throws past this point, the pending row would
  // otherwise stay stuck at "Sending…" forever — the caller's retry/count
  // logic sees the failure, but nothing in EmailActivityLog ever reflects
  // it. Finalize it as failed before re-throwing, same "always resolve the
  // pending row" discipline as leadSender.js's send paths.
  let providerMessageId;
  let emailProvider;
  try {
    emailProvider = getEmailProvider(resolvedAccount);
    ({ providerMessageId } = await emailProvider.send({
      to: lead.email,
      subject,
      body: bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      html: trackedHtml,
      unsubscribeUrl,
      replyTo: campaign.replyTo
    }));
  } catch (err) {
    await prisma.emailActivityLog.update({
      where: { id: pendingActivity.id },
      data: { detail: `Failed to send: ${err.message}` }
    });
    throw err;
  }

  const fullDetail = warnings.length
    ? `Sent via ${emailProvider.name} provider (message id ${providerMessageId}).\n\nDeliverability warnings:\n- ${warnings.join("\n- ")}`
    : `Sent via ${emailProvider.name} provider (message id ${providerMessageId}).`;
  const activity = await prisma.emailActivityLog.update({
    where: { id: pendingActivity.id },
    data: { detail: fullDetail }
  });

  return { activity, warnings };
}
