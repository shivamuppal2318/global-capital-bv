import { prisma } from "./prisma.js";
import { computeWarmupLimit } from "./warmup.js";

// Separate from sendCap.js's per-campaign cap on purpose: multiple
// campaigns can share one EmailAccount, and each campaign's own configured
// dailyLimit has no idea what other campaigns are also sending through the
// same mailbox. Without this, two campaigns each configured for 500/day
// but pointed at the same account could jointly blast 1000/day through a
// mailbox whose real-world provider limit is, say, 300 — exactly the kind
// of burst that gets a mailbox flagged or rate-limited by its own provider.
//
// Also runs the same warm-up ramp sendCap.js applies per-campaign, but
// keyed off the ACCOUNT's own age — a brand-new mailbox has no sending
// reputation regardless of how old the campaign routed through it is (a
// fresh account attached to an already-ramped, months-old campaign would
// otherwise get to send that campaign's full volume on day one). Without
// this the account-level cap was just a flat ceiling that never actually
// protected a new mailbox's first weeks.
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

  const effectiveLimit = computeWarmupLimit(account.dailyLimit, account.createdAt);

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const sentToday = await client.emailActivityLog.count({
    where: {
      kind: "BRANCH_EMAIL_SENT",
      createdAt: { gte: startOfDayUtc },
      // The account a send actually went through (see leadSender.js /
      // cadenceQueue.js) — not inferred via the lead's campaign assignment,
      // since country-based routing (accountRouting.js) can send a lead
      // through a different mailbox than the one its campaign is assigned
      // to.
      emailAccountId: account.id
    }
  });

  return sentToday < effectiveLimit;
}
