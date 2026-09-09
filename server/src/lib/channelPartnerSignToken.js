import crypto from "node:crypto";

function secret() {
  const value = process.env.CHANNEL_PARTNER_SIGN_SECRET;
  if (!value) {
    throw new Error("CHANNEL_PARTNER_SIGN_SECRET is not set — required to sign/verify Channel Partner Agreement links.");
  }
  return value;
}

// Same HMAC-signed-link pattern as ndaSignToken.js, deliberately its own
// secret — a leaked NDA-signing secret shouldn't also let someone forge a
// Channel Partner Agreement link.
export function signChannelPartnerToken(partnerId) {
  return crypto.createHmac("sha256", secret()).update(partnerId).digest("hex");
}

export function verifyChannelPartnerToken(partnerId, token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(signChannelPartnerToken(partnerId), "hex");
  const provided = Buffer.from(token, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}
