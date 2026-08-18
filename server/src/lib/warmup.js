// A brand-new sending domain/IP has no reputation yet — mailbox providers
// expect volume to ramp gradually (this schedule is a common rule-of-thumb
// shape, not any single provider's official numbers, since providers don't
// publish exact figures). Without this, a campaign's configured dailyLimit
// (e.g. 2000) would apply in full from day one regardless of how new the
// sending identity is.
const WARMUP_SCHEDULE = [
  { afterDays: 0, limit: 50 },
  { afterDays: 3, limit: 200 },
  { afterDays: 7, limit: 500 },
  { afterDays: 14, limit: 1000 },
  { afterDays: 21, limit: Infinity } // fully ramped — deconstrain to whatever's configured
];

// The effective cap is always the smaller of the ramp stage and the
// campaign's own configured dailyLimit — warm-up only ever restricts
// further, it never grants more send volume than was configured.
export function computeWarmupLimit(configuredDailyLimit, campaignCreatedAt, now = new Date()) {
  const ageDays = Math.floor((now.getTime() - campaignCreatedAt.getTime()) / (24 * 60 * 60 * 1000));

  let rampLimit = WARMUP_SCHEDULE[0].limit;
  for (const step of WARMUP_SCHEDULE) {
    if (ageDays >= step.afterDays) {
      rampLimit = step.limit;
    }
  }

  return Math.min(rampLimit, configuredDailyLimit);
}
