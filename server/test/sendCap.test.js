import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnderDailyCap } from "../src/lib/sendCap.js";

// isUnderDailyCap takes an injectable client (default: the real Prisma
// singleton) specifically so it's testable without a live Postgres or
// having to mock Prisma's proxy-based model delegates.
function fakeClient(count) {
  return { emailActivityLog: { count: async () => count } };
}

// Fully-ramped (created 365 days ago) so the warm-up schedule in warmup.js
// doesn't interfere with these cap-boundary tests — that logic has its own
// dedicated tests in warmup.test.js.
function fullyRampedCampaign(dailyLimit) {
  return { id: "campaign-1", dailyLimit, createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) };
}

test("isUnderDailyCap returns true when sent count is below the limit", async () => {
  assert.equal(await isUnderDailyCap(fullyRampedCampaign(10), fakeClient(5)), true);
});

test("isUnderDailyCap returns false when sent count equals the limit", async () => {
  assert.equal(await isUnderDailyCap(fullyRampedCampaign(10), fakeClient(10)), false);
});

test("isUnderDailyCap returns false when sent count exceeds the limit", async () => {
  assert.equal(await isUnderDailyCap(fullyRampedCampaign(10), fakeClient(11)), false);
});

test("isUnderDailyCap returns true when nothing has been sent yet", async () => {
  assert.equal(await isUnderDailyCap(fullyRampedCampaign(10), fakeClient(0)), true);
});

test("isUnderDailyCap scopes the count query to BRANCH_EMAIL_SENT, today, and the given campaign", async () => {
  let capturedArgs;
  const client = {
    emailActivityLog: {
      count: async (args) => {
        capturedArgs = args;
        return 0;
      }
    }
  };

  await isUnderDailyCap({ id: "campaign-123", dailyLimit: 10, createdAt: new Date(0) }, client);

  assert.equal(capturedArgs.where.kind, "BRANCH_EMAIL_SENT");
  assert.equal(capturedArgs.where.lead.campaignId, "campaign-123");
  assert.ok(capturedArgs.where.createdAt.gte instanceof Date);
});

test("isUnderDailyCap applies the warm-up ramp for a brand-new campaign", async () => {
  const brandNewCampaign = { id: "campaign-new", dailyLimit: 2000, createdAt: new Date() };
  // Day-0 ramp limit is 50 (see warmup.js) even though dailyLimit is 2000.
  assert.equal(await isUnderDailyCap(brandNewCampaign, fakeClient(49)), true);
  assert.equal(await isUnderDailyCap(brandNewCampaign, fakeClient(50)), false);
});
