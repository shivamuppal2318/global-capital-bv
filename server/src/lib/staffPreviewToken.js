import crypto from "node:crypto";

// Same HMAC-signed-link shape as clientPortalToken.js, but deliberately
// reuses its secret rather than requiring a new env var — every other
// signed-link file (ndaSignToken/unsubscribeToken/clientPortalToken) keeps
// its own secret so a leak in one has no bearing on another, but this one
// is staff-only, read-only, and expires in minutes, so that isolation
// isn't worth one more required production secret (we've already had one
// deployment break from a missing env var — see CLIENT_PORTAL_SECRET).
function secret() {
  const value = process.env.CLIENT_PORTAL_SECRET;
  if (!value) {
    throw new Error("CLIENT_PORTAL_SECRET is not set — required to sign/verify staff preview links.");
  }
  return value;
}

const PREVIEW_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to open and look around, short enough that a leaked/shared link goes stale fast.

// A staff member's bearer JWT can't be attached to a plain browser
// navigation (opening a new tab has no way to set an Authorization
// header), so "view as client" uses its own short-lived, single-lead,
// read-only link instead — same reasoning as the client invite/NDA-sign
// tokens: the token embeds its own expiry, no DB row to track or clean up.
export function signStaffPreviewToken(leadId) {
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  const payload = `${leadId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyStaffPreviewToken(token) {
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
