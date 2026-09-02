import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyZoomWebhookSignature,
  signZoomWebhookPayload,
  buildZoomUrlValidationResponse
} from "../src/lib/zoomWebhookAuth.js";

const SECRET_TOKEN = "test-zoom-secret-token";
const BODY = JSON.stringify({ event: "recording.completed", payload: { object: { id: 123456789 } } });

test("a correctly-signed payload verifies", () => {
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, SECRET_TOKEN);
  assert.equal(verifyZoomWebhookSignature(BODY, signatureHeader, timestampHeader, SECRET_TOKEN), true);
});

test("a signature computed with the wrong secret token fails", () => {
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, "wrong-secret");
  assert.equal(verifyZoomWebhookSignature(BODY, signatureHeader, timestampHeader, SECRET_TOKEN), false);
});

test("a tampered body fails verification even with a validly-shaped header", () => {
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, SECRET_TOKEN);
  const tamperedBody = JSON.stringify({ event: "recording.completed", payload: { object: { id: 999 } } });
  assert.equal(verifyZoomWebhookSignature(tamperedBody, signatureHeader, timestampHeader, SECRET_TOKEN), false);
});

test("rejects a missing signature header", () => {
  assert.equal(verifyZoomWebhookSignature(BODY, undefined, "1700000000", SECRET_TOKEN), false);
  assert.equal(verifyZoomWebhookSignature(BODY, "", "1700000000", SECRET_TOKEN), false);
});

test("rejects a missing timestamp header", () => {
  assert.equal(verifyZoomWebhookSignature(BODY, "v0=deadbeef", undefined, SECRET_TOKEN), false);
});

test("rejects a timestamp outside the tolerance window (replay protection)", () => {
  const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, SECRET_TOKEN, { timestamp: oldTimestamp });
  assert.equal(verifyZoomWebhookSignature(BODY, signatureHeader, timestampHeader, SECRET_TOKEN, { toleranceSeconds: 300 }), false);
});

test("accepts a timestamp within a custom tolerance window", () => {
  const timestamp = Math.floor(Date.now() / 1000) - 100;
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, SECRET_TOKEN, { timestamp });
  assert.equal(verifyZoomWebhookSignature(BODY, signatureHeader, timestampHeader, SECRET_TOKEN, { toleranceSeconds: 300 }), true);
});

test("rejects a non-numeric timestamp without throwing", () => {
  assert.equal(verifyZoomWebhookSignature(BODY, "v0=deadbeef", "not-a-number", SECRET_TOKEN), false);
});

test("verifyZoomWebhookSignature accepts a signature header without the v0= prefix too", () => {
  const { timestampHeader, signatureHeader } = signZoomWebhookPayload(BODY, SECRET_TOKEN);
  const bareSignature = signatureHeader.replace(/^v0=/, "");
  assert.equal(verifyZoomWebhookSignature(BODY, bareSignature, timestampHeader, SECRET_TOKEN), true);
});

test("buildZoomUrlValidationResponse echoes the plainToken and a matching encryptedToken", () => {
  const result = buildZoomUrlValidationResponse("qgg8vlvZRS6UYooatFL8Aw", SECRET_TOKEN);
  assert.equal(result.plainToken, "qgg8vlvZRS6UYooatFL8Aw");
  assert.match(result.encryptedToken, /^[0-9a-f]{64}$/);
});

test("buildZoomUrlValidationResponse is deterministic for the same plainToken/secret", () => {
  const a = buildZoomUrlValidationResponse("abc123", SECRET_TOKEN);
  const b = buildZoomUrlValidationResponse("abc123", SECRET_TOKEN);
  assert.equal(a.encryptedToken, b.encryptedToken);
});
