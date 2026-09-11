import { prisma } from "./prisma.js";
import { getEmailProvider } from "./emailProvider.js";
import { sendSystemEmail } from "./systemMailer.js";

const OUTREACH_SEND_KINDS = ["BRANCH_EMAIL_SENT", "CAMPAIGN_BLAST_SENT"];

export async function resolveLatestOutreachEmailAccountForLead(lead) {
  const relatedLeadWhere = [{ convertedToLeadId: lead.id }];
  if (lead.email) {
    relatedLeadWhere.push({ email: lead.email });
  }

  const lastOutreachSend = await prisma.emailActivityLog.findFirst({
    where: {
      kind: { in: OUTREACH_SEND_KINDS },
      emailAccountId: { not: null },
      lead: { OR: relatedLeadWhere }
    },
    orderBy: { createdAt: "desc" },
    include: { emailAccount: true }
  });

  return lastOutreachSend?.emailAccount?.isActive ? lastOutreachSend.emailAccount : null;
}

export async function sendLeadRoutedTransactionalEmail(lead, { subject, html, text }) {
  const outreachAccount = await resolveLatestOutreachEmailAccountForLead(lead);
  if (!outreachAccount) {
    return sendSystemEmail({ to: lead.email, subject, html, text });
  }

  try {
    const emailProvider = getEmailProvider(outreachAccount);
    const { providerMessageId } = await emailProvider.send({ to: lead.email, subject, body: text, html });
    return { sent: true, messageId: providerMessageId };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

// ownerName is a plain name string (NdaRecord.owner / IoiRecord.owner), the
// same "matches User.name" convention accountRouting.js already uses for
// campaign sends — these records predate any per-employee ownership FK, so
// there's no id to join on directly. Falls back to the shared system mailbox
// when the name doesn't match a real employee, or that employee has no
// personal mailbox connected — a reminder should still go out either way,
// just not necessarily "from" that person.
export async function sendDoeRoutedTransactionalEmail(ownerName, to, { subject, html, text }) {
  const doeUser = ownerName ? await prisma.user.findFirst({ where: { name: ownerName } }) : null;
  const doeMailbox = doeUser
    ? await prisma.emailAccount.findFirst({
        where: { isActive: true, ownerId: doeUser.id },
        orderBy: { updatedAt: "desc" }
      })
    : null;

  if (!doeMailbox) {
    return sendSystemEmail({ to, subject, html, text });
  }

  try {
    const emailProvider = getEmailProvider(doeMailbox);
    const { providerMessageId } = await emailProvider.send({ to, subject, body: text, html });
    return { sent: true, messageId: providerMessageId };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
