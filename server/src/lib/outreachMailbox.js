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
