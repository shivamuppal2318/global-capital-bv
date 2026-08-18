import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWarmupLimit } from "../src/lib/warmup.js";

function daysAgo(n, now) {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

test("a brand-new campaign (created just now) gets the day-0 ramp limit", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  assert.equal(computeWarmupLimit(2000, now, now), 50);
});

test("ramp increases at each threshold", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  assert.equal(computeWarmupLimit(2000, daysAgo(3, now), now), 200);
  assert.equal(computeWarmupLimit(2000, daysAgo(7, now), now), 500);
  assert.equal(computeWarmupLimit(2000, daysAgo(14, now), now), 1000);
});

test("a day just before a threshold still uses the previous ramp stage", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  assert.equal(computeWarmupLimit(2000, daysAgo(2, now), now), 50);
  assert.equal(computeWarmupLimit(2000, daysAgo(6, now), now), 200);
});

test("after full ramp-up (21+ days), the configured dailyLimit applies uncapped", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  assert.equal(computeWarmupLimit(2000, daysAgo(21, now), now), 2000);
  assert.equal(computeWarmupLimit(2000, daysAgo(365, now), now), 2000);
});

test("warm-up never grants more than the configured dailyLimit, even mid-ramp", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  // Day-7 ramp stage would normally allow 500, but dailyLimit is set lower.
  assert.equal(computeWarmupLimit(100, daysAgo(7, now), now), 100);
});

test("a fully-ramped campaign with a low configured dailyLimit stays capped at that limit", () => {
  const now = new Date("2026-01-22T00:00:00Z");
  assert.equal(computeWarmupLimit(30, daysAgo(365, now), now), 30);
});
