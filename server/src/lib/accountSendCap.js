import { prisma } from "./prisma.js";

// Separate from sendCap.js's per-campaign cap on purpose: multiple
// campaigns can share one EmailAccount, and each campaign's own configured
// dailyLimit has no idea what other campaigns are also sending through the
// same mailbox. Without this, two campaigns each configured for 500/day
// but pointed at the same account could jointly blast 1000/day through a
// mailbox whose real-world provider limit is, say, 300 — exactly the kind
// of burst that gets a mailbox flagged or rate-limited by its own provider.
//
// `client` is injectable for the same reason as sendCap.js — testable
// without mocking Prisma's proxy-based model delegates.
export async function isAccountUnderDailyCap(account, client = prisma) {
  if (!account) {
    // No account assigned means the campaign falls back to the single
    // global env-configured provider — there's no EmailAccount.dailyLimit
    // to check against in that case, only the campaign-level cap applies.
    return true;
  }

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const sentToday = await client.emailActivityLog.count({
    where: {
      kind: "BRANCH_EMAIL_SENT",
      createdAt: { gte: startOfDayUtc },
      lead: { campaign: { emailAccountId: account.id } }
    }
  });

  return sentToday < account.dailyLimit;
}
