import { prisma } from "../db.js";
import { signClientInviteToken } from "./clientPortalToken.js";
import { ndaReadyToSignEmail, ndaReminderEmail } from "./systemMailer.js";
import { sendLeadRoutedTransactionalEmail, sendDoeRoutedTransactionalEmail } from "./outreachMailbox.js";

// Same reasoning as leads.js's apiBaseUrl(): the client portal is
// server-rendered by THIS API, not the React SPA, so its links point at
// the API's own base URL, not the frontend's CORS_ORIGIN.
function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

// Advancing the status flow (Sent -> Reminder 1 -> Reminder 2 -> Signed) as
// a single action, so no caller has to know which timestamp field each
// step writes — and so the timestamp can never be forgotten.
export const NDA_ACTION_FIELD = {
  send: { field: "sentAt", status: "SENT" },
  remind1: { field: "reminder1At", status: "REMINDER_1" },
  remind2: { field: "reminder2At", status: "REMINDER_2" },
  sign: { field: "signedAt", status: "SIGNED" }
};

const include = {
  lead: { select: { id: true, name: true, company: true, email: true } },
  document: { select: { id: true, originalName: true, leadId: true } }
};

// Shared by the manual "Reminder 1/2" buttons (routes/ndaRecords.js) and
// the automatic reminder sweep (ndaReminderScheduler.js) — one real
// send/email implementation instead of two that could quietly drift apart.
// Does NOT re-check ownership/scoping (the manual route already loaded
// `existing` through its own req-scoped query; the scheduler has no req at
// all and is meant to sweep every eligible record company-wide) or the
// "already sent/signed" guards specific to a human clicking a button out of
// order — callers that need those keep checking them before calling this.
export async function advanceNdaRecord(existing, action) {
  const step = NDA_ACTION_FIELD[action];
  const record = await prisma.ndaRecord.update({
    where: { id: existing.id },
    data: { [step.field]: new Date(), status: step.status },
    include
  });

  // "Send" goes out through whichever mailbox last actually emailed this
  // lead (sendLeadRoutedTransactionalEmail) — continuing whatever
  // conversation thread the lead is already in. A reminder is different: the
  // client hasn't replied, so there's no "last mailbox that reached them" to
  // continue — it should come from the DOE on the record by identity
  // (sendDoeRoutedTransactionalEmail), so the client sees the same rep
  // chasing them down, not a different address each time.
  let emailResult = null;
  if (["send", "remind1", "remind2"].includes(action)) {
    const lead = await prisma.lead.findUnique({ where: { id: existing.leadId }, include: { clientUser: true } });
    const portalUrl = lead.clientUser
      ? `${apiBaseUrl()}/api/client-portal/login`
      : `${apiBaseUrl()}/api/client-portal/register/${signClientInviteToken(lead.id)}`;

    if (!lead.email) {
      emailResult = { emailed: false, reason: "This lead has no email address on file.", portalUrl: null };
    } else if (action === "send") {
      const { subject, html, text } = ndaReadyToSignEmail({
        contactName: lead.name,
        company: lead.company,
        doeName: record.owner,
        portalUrl,
        isNewAccount: !lead.clientUser
      });
      const result = await sendLeadRoutedTransactionalEmail(lead, { subject, html, text });
      emailResult = { emailed: result.sent, reason: result.sent ? undefined : result.reason, portalUrl };
    } else {
      const { subject, html, text } = ndaReminderEmail({
        contactName: lead.name,
        company: lead.company,
        doeName: record.owner,
        portalUrl,
        isNewAccount: !lead.clientUser,
        reminderNumber: action === "remind2" ? 2 : 1
      });
      const result = await sendDoeRoutedTransactionalEmail(record.owner, lead.email, { subject, html, text });
      emailResult = { emailed: result.sent, reason: result.sent ? undefined : result.reason, portalUrl };
    }
  }

  return { record, emailResult };
}
