import crypto from "node:crypto";

// Only the SHA-256 of an emailed reset token is ever stored — a database
// leak alone can't be replayed to take over an account. Shared by the
// staff and client portal reset flows so both hash the same way.
export function hashResetToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
