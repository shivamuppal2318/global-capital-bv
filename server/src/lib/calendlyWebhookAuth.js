import crypto from "node:crypto";

// Calendly signs webhook requests with a `Calendly-Webhook-Signature`
// header shaped like `t=<unix timestamp>,v1=<hex hmac>`, where the hmac is
// HMAC-SHA256(signingKey, `${t}.${rawRequestBody}`) — the same
// timestamp-prefixed scheme Stripe uses. Written from Calendly's documented
// webhook-signing spec, but not verified against a live account (none
// available here) — double-check the exact header name/format against
// Calendly's current docs before wiring a real subscription, in case it's
// changed since.
//
// `toleranceSeconds` rejects an old timestamp to limit replay-attack window
// (a captured valid signature stays "valid" forever without this check).
export function verifyCalendlyWebhookSignature(rawBody, signatureHeader, signingKey, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );

  const timestamp = parts.t;
  const providedSignature = parts.v1;
  if (!timestamp || !providedSignature) {
    return false;
  }

  const ageSeconds = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const provided = Buffer.from(providedSignature, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}

// Builds a correctly-signed header — used by the test suite and by a
// self-test script to prove the receiver actually validates real Calendly
// signatures, not just that the code compiles. Also useful if Calendly's
// own webhook test/ping tool needs matching locally.
export function signCalendlyWebhookPayload(rawBody, signingKey, { timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const signature = crypto.createHmac("sha256", signingKey).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
