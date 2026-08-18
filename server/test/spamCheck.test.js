import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpamSignals } from "../src/lib/spamCheck.js";

test("clean, real template content produces zero warnings", () => {
  const warnings = checkSpamSignals({
    subject: "NDA signature + next steps",
    body: "Thanks for the interest.\n\n--\nUnsubscribe: https://example.com/unsubscribe/abc"
  });
  assert.deepEqual(warnings, []);
});

test("flags all-caps subject", () => {
  const warnings = checkSpamSignals({ subject: "URGENT ACTION REQUIRED", body: "Hi. Unsubscribe: x" });
  assert.ok(warnings.includes("Subject is all caps"));
});

test("does not flag a short/mixed-case subject as all caps", () => {
  const warnings = checkSpamSignals({ subject: "Hi there", body: "Hi. Unsubscribe: x" });
  assert.ok(!warnings.includes("Subject is all caps"));
});

test("flags multiple exclamation marks in subject", () => {
  const warnings = checkSpamSignals({ subject: "Act now!!", body: "Hi. Unsubscribe: x" });
  assert.ok(warnings.includes("Subject has multiple exclamation marks"));
});

test("does not flag a single exclamation mark", () => {
  const warnings = checkSpamSignals({ subject: "Great news!", body: "Hi. Unsubscribe: x" });
  assert.ok(!warnings.includes("Subject has multiple exclamation marks"));
});

test("flags known spam-trigger phrases in body or subject", () => {
  const warnings = checkSpamSignals({ subject: "Hi", body: "This is 100% free and guaranteed, buy now!" });
  assert.ok(warnings.some((w) => w.includes("100% free")));
  assert.ok(warnings.some((w) => w.includes("guaranteed")));
  assert.ok(warnings.some((w) => w.includes("buy now")));
});

test("flags missing unsubscribe mention in plain-text body", () => {
  const warnings = checkSpamSignals({ subject: "Hi", body: "No opt-out mentioned here at all." });
  assert.ok(warnings.some((w) => w.includes("no unsubscribe mention")));
});

test("does not flag when body mentions unsubscribe", () => {
  const warnings = checkSpamSignals({ subject: "Hi", body: "Click here to unsubscribe." });
  assert.ok(!warnings.some((w) => w.includes("no unsubscribe mention")));
});
