import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChannelPartnerCommission, isMaintenanceFeeEligible, STANDARD_COMMISSION_TIERS } from "../src/lib/channelPartnerCommission.js";

test("STANDARD_COMMISSION_TIERS matches the agreement's three bands", () => {
  assert.equal(STANDARD_COMMISSION_TIERS.length, 3);
  assert.deepEqual(
    STANDARD_COMMISSION_TIERS.map((t) => t.pct),
    [1, 0.75, 0.5]
  );
});

test("computeChannelPartnerCommission applies the 1% tier for 10M-50M", () => {
  const result = computeChannelPartnerCommission(20_000_000);
  assert.equal(result.pct, 1);
  assert.equal(result.commissionAmount, 200_000);
  assert.equal(result.usedCustomRate, false);
});

test("computeChannelPartnerCommission applies the 0.75% tier for 50M-100M", () => {
  const result = computeChannelPartnerCommission(60_000_000);
  assert.equal(result.pct, 0.75);
  assert.equal(result.commissionAmount, 450_000);
});

test("computeChannelPartnerCommission applies the 0.5% tier for 100M+", () => {
  const result = computeChannelPartnerCommission(150_000_000);
  assert.equal(result.pct, 0.5);
  assert.equal(result.commissionAmount, 750_000);
});

test("computeChannelPartnerCommission treats tier boundaries as inclusive of the lower bound", () => {
  assert.equal(computeChannelPartnerCommission(10_000_000).pct, 1);
  assert.equal(computeChannelPartnerCommission(50_000_000).pct, 0.75);
  assert.equal(computeChannelPartnerCommission(100_000_000).pct, 0.5);
});

test("computeChannelPartnerCommission returns nulls below the 10M floor, not a fabricated rate", () => {
  const result = computeChannelPartnerCommission(5_000_000);
  assert.equal(result.pct, null);
  assert.equal(result.commissionAmount, null);
  assert.equal(result.usedCustomRate, false);
});

test("computeChannelPartnerCommission uses a partner's custom rate instead of the standard tiers when set", () => {
  const result = computeChannelPartnerCommission(5_000_000, 2.5);
  assert.equal(result.pct, 2.5);
  assert.equal(result.commissionAmount, 125_000);
  assert.equal(result.usedCustomRate, true);
  assert.equal(result.tier, null);
});

test("computeChannelPartnerCommission's custom rate applies even within the standard tiers' range", () => {
  const result = computeChannelPartnerCommission(60_000_000, 3);
  assert.equal(result.pct, 3);
  assert.equal(result.commissionAmount, 1_800_000);
  assert.equal(result.usedCustomRate, true);
});

test("computeChannelPartnerCommission rejects a negative or non-numeric amount", () => {
  assert.throws(() => computeChannelPartnerCommission(-1));
  assert.throws(() => computeChannelPartnerCommission("60000000"));
  assert.throws(() => computeChannelPartnerCommission(NaN));
});

test("isMaintenanceFeeEligible matches Clause 7.4's 10-client threshold", () => {
  assert.equal(isMaintenanceFeeEligible(9), false);
  assert.equal(isMaintenanceFeeEligible(10), true);
  assert.equal(isMaintenanceFeeEligible(11), true);
});
