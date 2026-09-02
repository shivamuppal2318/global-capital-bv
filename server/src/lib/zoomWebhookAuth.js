import crypto from "node:crypto";

// Zoom signs webhook requests with two headers: `x-zm-request-timestamp`
// (unix seconds) and `x-zm-signature` shaped like `v0=<hex hmac>`, where
// the hmac is HMAC-SHA256(secretToken, `v0:${timestamp}:${rawRequestBody}`)
// — Zoom's documented Server-to-Server webhook signing scheme (the Secret
// Token comes from the app's Marketplace page, Feature → Event
// Subscriptions, same one shown when the app's webhook feature is set up).
//
// `toleranceSeconds` rejects an old timestamp to limit the replay-attack
// window — same reasoning as calendlyWebhookAuth.js's identical guard.
export function verifyZoomWebhookSignature(rawBody, signatureHeader, timestampHeader, secretToken, { toleranceSeconds = 300, now = Date.now() } = {}) {
  if (!signatureHeader || typeof signatureHeader !== "string") return false;
  if (!timestampHeader) return false;

  const providedSignature = signatureHeader.startsWith("v0=") ? signatureHeader.slice(3) : signatureHeader;

  const ageSeconds = Math.abs(now / 1000 - Number(timestampHeader));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) return false;

  const message = `v0:${timestampHeader}:${rawBody}`;
  const expectedSignature = crypto.createHmac("sha256", secretToken).update(message).digest("hex");

  const expected = Buffer.from(expectedSignature, "hex");
  const provided = Buffer.from(providedSignature, "hex");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

// Builds a correctly-signed header pair — used by tests, and matches what
// signCalendlyWebhookPayload does for the same reason (proving the
// receiver validates real signatures, not just that the code compiles).
export function signZoomWebhookPayload(rawBody, secretToken, { timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const message = `v0:${timestamp}:${rawBody}`;
  const signature = crypto.createHmac("sha256", secretToken).update(message).digest("hex");
  return { timestampHeader: String(timestamp), signatureHeader: `v0=${signature}` };
}

// The one-time handshake Zoom performs when a webhook endpoint URL is
// first saved (or re-validated) in the Marketplace: it POSTs
// { event: "endpoint.url_validation", payload: { plainToken } } with no
// signature headers at all (there's nothing to sign yet), and expects
// { plainToken, encryptedToken } back, where encryptedToken is
// HMAC-SHA256(secretToken, plainToken) as hex — not the v0:timestamp:body
// scheme above, a separate documented format just for this handshake.
export function buildZoomUrlValidationResponse(plainToken, secretToken) {
  const encryptedToken = crypto.createHmac("sha256", secretToken).update(plainToken).digest("hex");
  return { plainToken, encryptedToken };
}
