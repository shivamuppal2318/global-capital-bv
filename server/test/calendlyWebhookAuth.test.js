import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCalendlyWebhookSignature, signCalendlyWebhookPayload } from "../src/lib/calendlyWebhookAuth.js";

const SIGNING_KEY = "test-calendly-signing-key";
const BODY = JSON.stringify({ event: "invitee.created", payload: { email: "lead@example.com" } });

test("a correctly-signed payload verifies", () => {
  const header = signCalendlyWebhookPayload(BODY, SIGNING_KEY);
  assert.equal(verifyCalendlyWebhookSignature(BODY, header, SIGNING_KEY), true);
});

test("a signature computed with the wrong signing key fails", () => {
  const header = signCalendlyWebhookPayload(BODY, "wrong-key");
  assert.equal(verifyCalendlyWebhookSignature(BODY, header, SIGNING_KEY), false);
});

test("a tampered body fails verification even with a validly-shaped header", () => {
  const header = signCalendlyWebhookPayload(BODY, SIGNING_KEY);
  const tamperedBody = JSON.stringify({ event: "invitee.created", payload: { email: "attacker@example.com" } });
  assert.equal(verifyCalendlyWebhookSignature(tamperedBody, header, SIGNING_KEY), false);
});

test("rejects a missing signature header", () => {
  assert.equal(verifyCalendlyWebhookSignature(BODY, undefined, SIGNING_KEY), false);
  assert.equal(verifyCalendlyWebhookSignature(BODY, "", SIGNING_KEY), false);
});

test("rejects a malformed header missing the v1 component", () => {
  assert.equal(verifyCalendlyWebhookSignature(BODY, "t=1234567890", SIGNING_KEY), false);
});

test("rejects a timestamp outside the tolerance window (replay protection)", () => {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
  const header = signCalendlyWebhookPayload(BODY, SIGNING_KEY, { timestamp: oldTimestamp });
  assert.equal(verifyCalendlyWebhookSignature(BODY, header, SIGNING_KEY, { toleranceSeconds: 300 }), false);
});

test("accepts a timestamp within a custom tolerance window", () => {
  const timestamp = Math.floor(Date.now() / 1000) - 100;
  const header = signCalendlyWebhookPayload(BODY, SIGNING_KEY, { timestamp });
  assert.equal(verifyCalendlyWebhookSignature(BODY, header, SIGNING_KEY, { toleranceSeconds: 300 }), true);
});

test("rejects a non-numeric timestamp without throwing", () => {
  assert.equal(verifyCalendlyWebhookSignature(BODY, "t=not-a-number,v1=deadbeef", SIGNING_KEY), false);
});
