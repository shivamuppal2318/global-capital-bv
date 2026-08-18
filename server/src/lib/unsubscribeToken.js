import crypto from "node:crypto";

function secret() {
  const value = process.env.UNSUBSCRIBE_SECRET;
  if (!value) {
    throw new Error("UNSUBSCRIBE_SECRET is not set — required to sign/verify unsubscribe links.");
  }
  return value;
}

// A bare lead id in an unsubscribe URL is guessable and enumerable — anyone
// could unsubscribe arbitrary leads by iterating ids. HMAC-signing the id
// makes the link only usable if it was actually issued by this server.
export function signUnsubscribeToken(leadId) {
  return crypto.createHmac("sha256", secret()).update(leadId).digest("hex");
}

export function verifyUnsubscribeToken(leadId, token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(signUnsubscribeToken(leadId), "hex");
  const provided = Buffer.from(token, "hex");
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard that first so a wrong-length token doesn't crash the request.
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}
