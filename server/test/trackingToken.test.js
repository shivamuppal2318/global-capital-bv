import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { signTrackingToken, verifyTrackingToken } from "../src/lib/trackingToken.js";

let original;
before(() => {
  original = process.env.TRACKING_SECRET;
  process.env.TRACKING_SECRET = "test-tracking-secret";
});
after(() => {
  process.env.TRACKING_SECRET = original;
});

test("a token signed for an activity log id verifies against that same id", () => {
  const token = signTrackingToken("activity-1");
  assert.equal(verifyTrackingToken("activity-1", token), true);
});

test("a token signed for one id does not verify for a different id", () => {
  const token = signTrackingToken("activity-1");
  assert.equal(verifyTrackingToken("activity-2", token), false);
});

test("a tampered token fails verification", () => {
  const token = signTrackingToken("activity-1");
  const tampered = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
  assert.equal(verifyTrackingToken("activity-1", tampered), false);
});

test("verifyTrackingToken rejects missing/empty/wrong-type tokens without throwing", () => {
  assert.equal(verifyTrackingToken("activity-1", undefined), false);
  assert.equal(verifyTrackingToken("activity-1", ""), false);
  assert.equal(verifyTrackingToken("activity-1", null), false);
});

test("signTrackingToken throws a clear error when TRACKING_SECRET is unset", () => {
  const saved = process.env.TRACKING_SECRET;
  delete process.env.TRACKING_SECRET;
  try {
    assert.throws(() => signTrackingToken("activity-1"), /TRACKING_SECRET is not set/);
  } finally {
    process.env.TRACKING_SECRET = saved;
  }
});
