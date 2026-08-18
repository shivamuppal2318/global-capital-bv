import crypto from "node:crypto";

function secret() {
  const value = process.env.NDA_SIGN_SECRET;
  if (!value) {
    throw new Error("NDA_SIGN_SECRET is not set — required to sign/verify NDA links.");
  }
  return value;
}

// Same HMAC-signed-link pattern as unsubscribeToken.js, deliberately a
// separate secret — an unsubscribe link and an NDA-signing link are very
// different-consequence actions, no reason for one leaked secret to
// compromise both.
export function signNdaToken(leadId) {
  return crypto.createHmac("sha256", secret()).update(leadId).digest("hex");
}

export function verifyNdaToken(leadId, token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(signNdaToken(leadId), "hex");
  const provided = Buffer.from(token, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}
