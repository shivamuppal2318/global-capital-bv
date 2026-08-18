import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCampaignHealth } from "../src/lib/campaignHealth.js";

test("does not pause below the minimum sample size, even at 100% bounce rate", () => {
  const result = evaluateCampaignHealth({ sentCount: 5, bounceCount: 5, complaintCount: 0 });
  assert.equal(result.shouldPause, false);
});

test("does not pause when bounce and complaint rates are healthy", () => {
  const result = evaluateCampaignHealth({ sentCount: 100, bounceCount: 2, complaintCount: 0 });
  assert.equal(result.shouldPause, false);
});

test("pauses when bounce rate exceeds the default 5% threshold", () => {
  const result = evaluateCampaignHealth({ sentCount: 100, bounceCount: 6, complaintCount: 0 });
  assert.equal(result.shouldPause, true);
  assert.match(result.reason, /Bounce rate/);
});

test("does not pause exactly at the threshold boundary (uses > not >=)", () => {
  const result = evaluateCampaignHealth({ sentCount: 100, bounceCount: 5, complaintCount: 0 });
  assert.equal(result.shouldPause, false);
});

test("pauses when complaint rate exceeds the default 0.1% threshold", () => {
  const result = evaluateCampaignHealth({ sentCount: 1000, bounceCount: 0, complaintCount: 2 });
  assert.equal(result.shouldPause, true);
  assert.match(result.reason, /complaint rate/);
});

test("complaint threshold takes priority over bounce threshold when both breach", () => {
  const result = evaluateCampaignHealth({ sentCount: 1000, bounceCount: 100, complaintCount: 5 });
  assert.equal(result.shouldPause, true);
  assert.match(result.reason, /complaint rate/);
});

test("custom thresholds override the defaults", () => {
  const result = evaluateCampaignHealth(
    { sentCount: 50, bounceCount: 3, complaintCount: 0 },
    { minSampleSize: 10, bounceRate: 0.05 }
  );
  assert.equal(result.shouldPause, true);
});
