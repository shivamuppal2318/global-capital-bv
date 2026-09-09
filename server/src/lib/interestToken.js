import crypto from "node:crypto";

function secret() {
  const value = process.env.INTEREST_SIGN_SECRET;
  if (!value) {
    throw new Error("INTEREST_SIGN_SECRET is not set — required to sign/verify the 'I'm Interested' link.");
  }
  return value;
}

// Same HMAC-signed-link pattern as ndaSignToken.js/unsubscribeToken.js — its
// own secret, since a leaked one shouldn't also let someone forge NDA or
// unsubscribe links.
export function signInterestToken(leadId) {
  return crypto.createHmac("sha256", secret()).update(leadId).digest("hex");
}

export function verifyInterestToken(leadId, token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(signInterestToken(leadId), "hex");
  const provided = Buffer.from(token, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}
