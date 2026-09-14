import { prisma } from "../db.js";
import { signClientInviteToken } from "./clientPortalToken.js";
import { ioiReadyToSignEmail, ioiReminderEmail } from "./systemMailer.js";
import { sendLeadRoutedTransactionalEmail, sendDoeRoutedTransactionalEmail } from "./outreachMailbox.js";

function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

// Advancing the lifecycle as a single action, so no caller has to know
// which timestamp each step writes — and so it can never be forgotten.
export const IOI_ACTION_FIELD = {
  generate: { field: "generatedAt", status: "GENERATED", label: "Generated" },
  send: { field: "sentAt", status: "SENT", label: "Sent" },
  remind1: { field: "reminder1At", status: "REMINDER_1", label: "Reminder 1" },
  remind2: { field: "reminder2At", status: "REMINDER_2", label: "Reminder 2" },
  sign: { field: "signedAt", status: "SIGNED", label: "Signed" }
};

const include = {
  lead: { select: { id: true, name: true, company: true } },
  document: { select: { id: true, originalName: true, leadId: true } }
};

// Shared by the manual "Reminder 1/2" buttons (routes/ioiRecords.js) and
// the automatic reminder sweep (ioiReminderScheduler.js) — same pairing as
// NDA's advanceNdaRecord/ndaActions.js, for the same reason (one real send
// implementation, not two that could quietly drift apart). Does NOT
// re-check ownership/scoping or "already sent" guards — callers that need
// those check them before calling this.
export async function advanceIoiRecord(existing, action) {
  const step = IOI_ACTION_FIELD[action];
  const record = await prisma.ioiRecord.update({
    where: { id: existing.id },
    data: { [step.field]: new Date(), status: step.status },
    include
  });

  // Same "send continues whatever mailbox last reached this lead, a
  // reminder goes out from the DOE by identity instead" reasoning as NDA.
  let emailResult = null;
  if (["send", "remind1", "remind2"].includes(action)) {
    const lead = await prisma.lead.findUnique({ where: { id: existing.leadId }, include: { clientUser: true } });
    const portalUrl = lead.clientUser
      ? `${apiBaseUrl()}/api/client-portal/login`
      : `${apiBaseUrl()}/api/client-portal/register/${signClientInviteToken(lead.id)}`;

    if (!lead.email) {
      emailResult = { emailed: false, reason: "This lead has no email address on file.", portalUrl: null };
    } else if (action === "send") {
      const { subject, html, text } = ioiReadyToSignEmail({
        contactName: lead.name,
        company: lead.company,
        doeName: record.owner,
        portalUrl,
        isNewAccount: !lead.clientUser
      });
      const result = await sendLeadRoutedTransactionalEmail(lead, { subject, html, text });
      emailResult = { emailed: result.sent, reason: result.sent ? undefined : result.reason, portalUrl };
    } else {
      const { subject, html, text } = ioiReminderEmail({
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
