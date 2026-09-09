import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initEncryptionKey, encryptSecret, decryptSecret } from "../src/lib/credentialCrypto.js";

// initEncryptionKey() resolves the key once at boot (see the module's own
// comment) and caches it — with ENCRYPTION_KEY set, that resolution is
// env-only and never touches the database, so these tests don't need a
// real Postgres connection the way the DB-fallback path would.
let original;
before(async () => {
  original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "test-encryption-key";
  await initEncryptionKey();
});
after(async () => {
  process.env.ENCRYPTION_KEY = original;
  await initEncryptionKey();
});

test("a secret round-trips through encrypt/decrypt unchanged", () => {
  const plaintext = "Anki@9130";
  const ciphertext = encryptSecret(plaintext);
  assert.equal(decryptSecret(ciphertext), plaintext);
});

test("ciphertext does not contain the plaintext password anywhere", () => {
  const plaintext = "super-secret-password";
  const ciphertext = encryptSecret(plaintext);
  assert.equal(ciphertext.includes(plaintext), false);
});

test("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
  const a = encryptSecret("same-password");
  const b = encryptSecret("same-password");
  assert.notEqual(a, b);
  // but both still decrypt correctly
  assert.equal(decryptSecret(a), "same-password");
  assert.equal(decryptSecret(b), "same-password");
});

test("a tampered ciphertext fails to decrypt instead of silently returning garbage", () => {
  const ciphertext = encryptSecret("password123");
  const bytes = Buffer.from(ciphertext, "base64");
  bytes[bytes.length - 1] ^= 0xff; // flip the last byte
  const tampered = bytes.toString("base64");
  assert.throws(() => decryptSecret(tampered));
});

test("decrypting with the wrong key fails instead of returning wrong plaintext", async () => {
  const ciphertext = encryptSecret("password123");
  process.env.ENCRYPTION_KEY = "a-completely-different-key";
  await initEncryptionKey();
  assert.throws(() => decryptSecret(ciphertext));
  process.env.ENCRYPTION_KEY = "test-encryption-key";
  await initEncryptionKey();
});
