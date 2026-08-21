import crypto from "node:crypto";
import { prisma } from "../db.js";

// Storing SMTP passwords and API keys in the database means they need to be
// at rest as ciphertext, not plaintext — AES-256-GCM (authenticated
// encryption: a tampered/corrupted ciphertext fails to decrypt rather than
// silently producing garbage).
//
// The 32-byte key is resolved ONCE at boot (see initEncryptionKey, called
// from src/index.js) so encrypt/decrypt below stay synchronous for their
// many call sites. Resolution order:
//
//   1. ENCRYPTION_KEY env var — preferred, because the key then lives
//      somewhere other than the database it protects.
//   2. A generated key persisted in the AppSecret table.
//
// The fallback exists because env vars set through Coolify's UI don't
// reliably reach the container (the same substitution problem that broke
// CORS_ORIGIN and JWT_SECRET), which left this feature permanently unable
// to save a credential. Its trade-off is real and worth stating: a key kept
// beside its ciphertext gives up most protection against a full-database
// compromise — it still helps against a leak of one table or a stale
// backup, but it is not equivalent to holding the key elsewhere. Set
// ENCRYPTION_KEY to get that separation back; it always wins when present.

const APP_SECRET_KEY = "encryption_key";

let derivedKey = null;

export async function initEncryptionKey() {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv) {
    derivedKey = crypto.createHash("sha256").update(fromEnv).digest();
    return { source: "environment" };
  }

  const existing = await prisma.appSecret.findUnique({ where: { key: APP_SECRET_KEY } });
  if (existing) {
    derivedKey = crypto.createHash("sha256").update(existing.value).digest();
    return { source: "database" };
  }

  const generated = crypto.randomBytes(32).toString("hex");
  // Concurrent boots can race; whoever loses the create re-reads the
  // winner's value. Both must end up with the same key or previously
  // encrypted rows become undecryptable.
  let value = generated;
  try {
    await prisma.appSecret.create({ data: { key: APP_SECRET_KEY, value: generated } });
  } catch {
    const raced = await prisma.appSecret.findUnique({ where: { key: APP_SECRET_KEY } });
    if (!raced) throw new Error("Could not create or read the credential encryption key.");
    value = raced.value;
  }

  derivedKey = crypto.createHash("sha256").update(value).digest();
  return { source: value === generated ? "generated" : "database" };
}

function deriveKey() {
  if (!derivedKey) {
    throw new Error("Encryption key is not initialised — initEncryptionKey() must run before storing or reading credentials.");
  }
  return derivedKey;
}

const IV_LENGTH = 12; // recommended nonce size for GCM
const AUTH_TAG_LENGTH = 16;

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
