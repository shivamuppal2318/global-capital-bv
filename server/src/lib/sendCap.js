import { prisma } from "./prisma.js";
import { computeWarmupLimit } from "./warmup.js";

// `client` is injectable (defaults to the real Prisma singleton) so tests
// can pass a plain stub instead of mocking Prisma's proxy-based model
// delegates, which node:test's mock.method can't introspect reliably.
//
// `campaign` needs { id, dailyLimit, createdAt } — the effective cap is
// whichever is smaller of the configured dailyLimit and the warm-up ramp
// for the campaign's age (see warmup.js), so a brand-new campaign can't
// blast its full configured volume on day one.
export async function isUnderDailyCap(campaign, client = prisma) {
  const effectiveLimit = computeWarmupLimit(campaign.dailyLimit, campaign.createdAt);

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const sentToday = await client.emailActivityLog.count({
    where: {
      kind: "BRANCH_EMAIL_SENT",
      createdAt: { gte: startOfDayUtc },
      lead: { campaignId: campaign.id }
    }
  });

  return sentToday < effectiveLimit;
}
