// The real, standard incentive schedule from the Channel Partner Agreement
// (Clause 7.3) — applies to a completed funding transaction based on how
// much the referred client borrowed. A partner's own negotiated rate
// (ChannelPartner.commissionPct), when set, overrides this schedule
// entirely rather than blending with it — Clause 7.1 makes the specific
// rate something "communicated by the Company in writing" per partner, so
// this is the default, not the only possibility.
export const STANDARD_COMMISSION_TIERS = [
  { minBorrowing: 10_000_000, maxBorrowing: 50_000_000, pct: 1 },
  { minBorrowing: 50_000_000, maxBorrowing: 100_000_000, pct: 0.75 },
  { minBorrowing: 100_000_000, maxBorrowing: Infinity, pct: 0.5 }
];

// Pure — testable without any DB access. `customPct` is the partner's own
// negotiated rate (null/undefined means "use the standard schedule").
export function computeChannelPartnerCommission(borrowingAmount, customPct = null) {
  if (typeof borrowingAmount !== "number" || !Number.isFinite(borrowingAmount) || borrowingAmount < 0) {
    throw new Error("borrowingAmount must be a non-negative number.");
  }

  if (customPct != null) {
    return { pct: customPct, commissionAmount: (borrowingAmount * customPct) / 100, tier: null, usedCustomRate: true };
  }

  const tier = STANDARD_COMMISSION_TIERS.find((t) => borrowingAmount >= t.minBorrowing && borrowingAmount < t.maxBorrowing);
  if (!tier) {
    // Below the standard schedule's 10M floor — the agreement doesn't
    // define a rate for this, so there's nothing honest to compute.
    return { pct: null, commissionAmount: null, tier: null, usedCustomRate: false };
  }

  return { pct: tier.pct, commissionAmount: (borrowingAmount * tier.pct) / 100, tier, usedCustomRate: false };
}

// Clause 7.4: an additional maintenance fee applies once a partner has
// referred 10 or more clients — the exact amount is "negotiated
// separately" (not a fixed formula like the commission tiers), so this
// only tells you whether the threshold is met, not a dollar figure.
export function isMaintenanceFeeEligible(referredLeadsCount) {
  return referredLeadsCount >= 10;
}
