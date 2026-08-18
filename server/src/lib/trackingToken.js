import crypto from "node:crypto";

function secret() {
  const value = process.env.TRACKING_SECRET;
  if (!value) {
    throw new Error("TRACKING_SECRET is not set — required to sign/verify open/click tracking links.");
  }
  return value;
}

// Same HMAC-signed-link pattern as unsubscribeToken.js/ndaSignToken.js,
// deliberately a separate secret — a leaked tracking-pixel token only lets
// someone fake an open/click event, which is low-consequence, but no
// reason to let a leaked one also forge unsubscribe/NDA actions.
export function signTrackingToken(activityLogId) {
  return crypto.createHmac("sha256", secret()).update(activityLogId).digest("hex");
}

export function verifyTrackingToken(activityLogId, token) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(signTrackingToken(activityLogId), "hex");
  const provided = Buffer.from(token, "hex");
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, provided);
}
