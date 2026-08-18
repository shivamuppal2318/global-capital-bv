import { test } from "node:test";
import assert from "node:assert/strict";
import { isLeadEligibleForCadenceStep } from "../src/lib/cadenceEligibility.js";

test("eligible when no reply, not bounced, not unsubscribed", () => {
  const result = isLeadEligibleForCadenceStep({ replyType: "NO_REPLY", bounced: false, unsubscribed: false });
  assert.equal(result.eligible, true);
});

test("not eligible once the lead has replied — this is the actual point of the check", () => {
  const result = isLeadEligibleForCadenceStep({ replyType: "INTERESTED", bounced: false, unsubscribed: false });
  assert.equal(result.eligible, false);
  assert.match(result.reason, /already replied/);
});

test("not eligible for any non-NO_REPLY replyType, not just INTERESTED", () => {
  for (const replyType of ["ZOOM_REQUEST", "INFO_REQUEST"]) {
    const result = isLeadEligibleForCadenceStep({ replyType, bounced: false, unsubscribed: false });
    assert.equal(result.eligible, false);
  }
});

test("not eligible when bounced, even if technically NO_REPLY", () => {
  const result = isLeadEligibleForCadenceStep({ replyType: "NO_REPLY", bounced: true, unsubscribed: false });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "bounced");
});

test("not eligible when unsubscribed", () => {
  const result = isLeadEligibleForCadenceStep({ replyType: "NO_REPLY", bounced: false, unsubscribed: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "unsubscribed");
});

test("bounced check takes priority over reply-type check", () => {
  const result = isLeadEligibleForCadenceStep({ replyType: "INTERESTED", bounced: true, unsubscribed: false });
  assert.equal(result.reason, "bounced");
});
