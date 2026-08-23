import { prisma } from "./prisma.js";
import { getEmailProvider } from "./emailProvider.js";
import { renderEmail } from "./renderTemplate.js";
import { checkSpamSignals } from "./spamCheck.js";
import { isUnderDailyCap } from "./sendCap.js";
import { isAccountUnderDailyCap } from "./accountSendCap.js";
import { resolveEmailAccount } from "./accountRouting.js";
import { signUnsubscribeToken } from "./unsubscribeToken.js";
import { signNdaToken } from "./ndaSignToken.js";
import { injectTrackingPixel, wrapLinksForClickTracking } from "./emailTracking.js";

// Extracted from routes/leads.js so the same send logic (suppression
// checks, daily cap, deliverability warnings, activity logging) can be
// called both from the HTTP routes AND from the auto-responder (see
// autoRespond.js), which fires when a reply is classified — not just when
// a human clicks a button in the UI.

export function unsubscribeUrlFor(leadId) {
  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;
  return `${base}/unsubscribe/${leadId}/${signUnsubscribeToken(leadId)}`;
}

export function ndaSignUrlFor(leadId) {
  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8787}`;
  return `${base}/nda/${leadId}/${signNdaToken(leadId)}`;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Every reason a send gets refused before it reaches the provider — bad
// address hygiene (unsubscribed/bounced) and burst-sending past the daily
// cap are both classic ways a sending domain's reputation gets downgraded,
// so these are hard blocks, not warnings.
export async function loadSendableLead(leadId) {
  const lead = await prisma.emailLead.findUnique({
    where: { id: leadId },
    include: { campaign: { include: { emailAccount: true } } }
  });
  if (!lead) {
    throw httpError(404, "Lead not found");
  }
  if (lead.unsubscribed) {
    throw httpError(409, `${lead.name} has unsubscribed; suppressing send.`);
  }
  if (lead.bounced) {
    throw httpError(409, `${lead.name}'s address previously ${lead.bounceKind?.toLowerCase() ?? "hard"}-bounced; suppressing send.`);
  }

  const withinCap = await isUnderDailyCap(lead.campaign);
  if (!withinCap) {
    throw httpError(
      429,
      `Daily send cap (${lead.campaign.dailyLimit}) reached for campaign "${lead.campaign.name}". Try again tomorrow — sending past a configured cap is a fast way to damage sender reputation.`
    );
  }

  // The mailbox this send will actually use — a country match (see
  // accountRouting.js) overrides the campaign's manually-assigned mailbox,
  // so this must be resolved before the account-level cap check below (that
  // check has to protect the mailbox that's really about to be used, not
  // necessarily the campaign's static assignment).
  const resolvedAccount = await resolveEmailAccount(lead, lead.campaign);

  // Separate from the campaign-level cap above: multiple campaigns (or
  // country-routed leads from campaigns with a different default) can share
  // one mailbox, and this is the check that actually protects the mailbox's
  // own real-world sending limit rather than just each campaign's
  // individually-configured one.
  const accountWithinCap = await isAccountUnderDailyCap(resolvedAccount);
  if (!accountWithinCap) {
    throw httpError(
      429,
      `Daily send cap (${resolvedAccount.dailyLimit}) reached for mailbox "${resolvedAccount.label}" — shared across every campaign/lead routed to it. Try again tomorrow.`
    );
  }

  return { ...lead, resolvedAccount };
}

// Open/click tracking needs the ActivityLog row's id to exist *before* the
// email is sent (the pixel/click URLs embed it) — so the row is created as
// a placeholder first, then updated with the final provider result after
// sending, instead of being created only after a successful send like
// every other write in this file used to work.
async function createPendingSendActivity(leadId, title, emailAccountId) {
  return prisma.emailActivityLog.create({
    data: { leadId, kind: "BRANCH_EMAIL_SENT", title, detail: "Sending…", emailAccountId }
  });
}

async function finalizeSendActivity(activityId, { detail, warnings }) {
  const fullDetail = warnings?.length ? `${detail}\n\nDeliverability warnings:\n- ${warnings.join("\n- ")}` : detail;
  return prisma.emailActivityLog.update({ where: { id: activityId }, data: { detail: fullDetail } });
}

// Embeds the open-tracking pixel and rewrites links for click-tracking —
// skipped for a plain-text-only send (no html) since there's nothing to
// inject a pixel/rewrite links into.
function applyTracking(html, activityId, unsubscribeUrl) {
  if (!html) {
    return html;
  }
  const withClickTracking = wrapLinksForClickTracking(html, activityId, { skipUrl: unsubscribeUrl });
  return injectTrackingPixel(withClickTracking, activityId);
}

// Explicit subject/body — e.g. a human hand-edited the draft in the UI
// before sending.
export async function sendRawEmail(leadId, { subject, body, html }) {
  const lead = await loadSendableLead(leadId);
  const warnings = checkSpamSignals({ subject, body });
  const unsubscribeUrl = unsubscribeUrlFor(lead.id);

  const pendingActivity = await createPendingSendActivity(lead.id, subject, lead.resolvedAccount?.id ?? null);
  const trackedHtml = applyTracking(html, pendingActivity.id, unsubscribeUrl);

  const emailProvider = getEmailProvider(lead.resolvedAccount);
  const { providerMessageId } = await emailProvider.send({ to: lead.email, subject, body, html: trackedHtml, unsubscribeUrl });

  const activity = await finalizeSendActivity(pendingActivity.id, {
    detail: `Sent via ${emailProvider.name} provider (message id ${providerMessageId}).`,
    warnings
  });

  return { activity, warnings };
}

// Resolved from a saved Template — merge fields, branded HTML, unsubscribe
// link all applied automatically.
export async function sendTemplateEmail(leadId, templateKey) {
  const lead = await loadSendableLead(leadId);

  const template = await prisma.emailTemplate.findUnique({ where: { key: templateKey } });
  if (!template) {
    throw httpError(404, `Template "${templateKey}" not found`);
  }

  const unsubscribeUrl = unsubscribeUrlFor(lead.id);
  const rendered = renderEmail(template, {
    leadName: lead.name,
    company: lead.company,
    unsubscribeUrl,
    ndaSignUrl: ndaSignUrlFor(lead.id)
  });
  const warnings = checkSpamSignals({ subject: rendered.subject, body: rendered.body });

  const pendingActivity = await createPendingSendActivity(lead.id, rendered.subject, lead.resolvedAccount?.id ?? null);
  const trackedHtml = applyTracking(rendered.html, pendingActivity.id, unsubscribeUrl);

  const emailProvider = getEmailProvider(lead.resolvedAccount);
  const { providerMessageId } = await emailProvider.send({
    to: lead.email,
    subject: rendered.subject,
    body: rendered.body,
    html: trackedHtml,
    unsubscribeUrl
  });

  const activity = await finalizeSendActivity(pendingActivity.id, {
    detail: `Sent via ${emailProvider.name} provider using template "${template.key}" (message id ${providerMessageId}).`,
    warnings
  });

  return { activity, warnings };
}
