import { prisma } from "./prisma.js";
import { matchReplyRule, classifyReply } from "./replyClassifier.js";
import { autoRespondToReply } from "./autoRespond.js";

// Shared by the inbound-email webhook (external mail provider, gated by
// INBOUND_WEBHOOK_SECRET), the IMAP poller (imapPoller.js — real replies
// landing in the actual mailbox), and the authenticated
// /leads/:id/simulate-reply route (internal CRM users testing the flow,
// gated by the normal API key). Deliberately different auth schemes for
// the same underlying action — a webhook secret is meant for
// server-to-server calls from a provider we don't control; shipping it to
// the browser so the frontend could call the webhook directly would
// defeat the point of it being secret.
//
// This is also where the reply loop actually closes: after classifying and
// recording the reply, it immediately fires the matching auto-response
// (NDA / Calendly / info pack) — this is what makes the whole thing
// "reply arrives -> lead gets the right email back" without a human
// clicking Send in between.
//
// How far along a reply type is, for guarding EmailLead.replyType below
// against ever moving backward — OTHER (a genuine reply that just didn't
// match a keyword rule) and INFO_REQUEST are real signals, but neither
// should be able to overwrite a lead that has already shown clearer
// interest. INTERESTED and ZOOM_REQUEST are treated as equally advanced,
// matching getStageFromReplyType/preferredPathForReplyType's own view
// (src/components/emailOutreach/useEmailOutreachState.js) that both lead to
// the same "Zoom 1 Pending" stage.
const REPLY_TYPE_RANK = { NO_REPLY: 0, OTHER: 1, INFO_REQUEST: 2, ZOOM_REQUEST: 3, INTERESTED: 3 };

// emailAccountId is only known by the IMAP poller (it polls one specific
// mailbox at a time) — the webhook and simulate-reply callers leave it
// null, since neither is tied to a particular mailbox's inbox.
export async function recordReply(lead, textBody, emailAccountId = null) {
  const matchedRule = matchReplyRule(textBody);
  const replyType = classifyReply(textBody);
  // The ReplyEvent/activity log below always record this message's own
  // real classification (accurate history of what THIS reply said) —
  // only the lead's current-status field is guarded against regressing,
  // e.g. a later "thanks, talk soon" (OTHER) shouldn't erase that the lead
  // already asked for a Zoom call.
  const nextLeadReplyType =
    (REPLY_TYPE_RANK[replyType] ?? 0) >= (REPLY_TYPE_RANK[lead.replyType] ?? 0) ? replyType : lead.replyType;

  await prisma.$transaction([
    prisma.replyEvent.create({
      data: { leadId: lead.id, rawBody: textBody, matchedRule: matchedRule?.id ?? null, replyType, emailAccountId }
    }),
    prisma.emailActivityLog.create({
      data: {
        leadId: lead.id,
        kind: "REPLY_RECEIVED",
        title: matchedRule ? `Reply classified: ${matchedRule.label}` : "Reply received (unclassified)",
        detail: textBody.slice(0, 500)
      }
    }),
    prisma.emailLead.update({ where: { id: lead.id }, data: { replyType: nextLeadReplyType } })
  ]);

  const autoResponse = await autoRespondToReply(lead.id, replyType);

  return { replyType, matchedRule, autoResponse };
}
