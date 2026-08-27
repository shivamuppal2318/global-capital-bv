import crypto from "node:crypto";

// Same HMAC-signed-link pattern as ndaSignToken.js/unsubscribeToken.js, its
// own secret for the same reason those are separate from each other — a
// leaked invite link shouldn't have any bearing on NDA-signing or
// unsubscribe links.
function secret() {
  const value = process.env.CLIENT_PORTAL_SECRET;
  if (!value) {
    throw new Error("CLIENT_PORTAL_SECRET is not set — required to sign/verify client portal invite links.");
  }
  return value;
}

const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a prospect may not open a cold email same-day.

// The token embeds its own expiry (base64url of "<leadId>.<expiresAtMs>"
// plus an HMAC) rather than requiring a DB row to track pending invites —
// same reasoning as the NDA link: nothing to clean up, nothing to look up
// before the signature check.
export function signClientInviteToken(leadId) {
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const payload = `${leadId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

// Returns the leadId on success, or null on any failure (malformed,
// tampered, or expired) — callers don't need to distinguish why.
export function verifyClientInviteToken(token) {
  if (!token || typeof token !== "string") return null;
  let decoded;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = decoded.split(".");
  if (parts.length !== 3) return null;
  const [leadId, expiresAtStr, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!leadId || !Number.isFinite(expiresAt)) return null;
  if (Date.now() > expiresAt) return null;

  const expectedSig = crypto.createHmac("sha256", secret()).update(`${leadId}.${expiresAtStr}`).digest("hex");
  const expected = Buffer.from(expectedSig, "hex");
  const provided = Buffer.from(sig, "hex");
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;

  return leadId;
}
