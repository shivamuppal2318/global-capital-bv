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
export async function recordReply(lead, textBody) {
  const matchedRule = matchReplyRule(textBody);
  const replyType = classifyReply(textBody);

  await prisma.$transaction([
    prisma.replyEvent.create({
      data: { leadId: lead.id, rawBody: textBody, matchedRule: matchedRule?.id ?? null, replyType }
    }),
    prisma.emailActivityLog.create({
      data: {
        leadId: lead.id,
        kind: "REPLY_RECEIVED",
        title: matchedRule ? `Reply classified: ${matchedRule.label}` : "Reply received (unclassified)",
        detail: textBody.slice(0, 500)
      }
    }),
    prisma.emailLead.update({ where: { id: lead.id }, data: { replyType } })
  ]);

  const autoResponse = await autoRespondToReply(lead.id, replyType);

  return { replyType, matchedRule, autoResponse };
}
