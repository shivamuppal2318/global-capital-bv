import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/lib/credentialCrypto.js";

let original;
before(() => {
  original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "test-encryption-key";
});
after(() => {
  process.env.ENCRYPTION_KEY = original;
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

test("decrypting with the wrong key fails instead of returning wrong plaintext", () => {
  const ciphertext = encryptSecret("password123");
  process.env.ENCRYPTION_KEY = "a-completely-different-key";
  assert.throws(() => decryptSecret(ciphertext));
  process.env.ENCRYPTION_KEY = "test-encryption-key";
});

test("encryptSecret throws a clear error when ENCRYPTION_KEY is unset", () => {
  const saved = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptSecret("x"), /ENCRYPTION_KEY is not set/);
  } finally {
    process.env.ENCRYPTION_KEY = saved;
  }
});
