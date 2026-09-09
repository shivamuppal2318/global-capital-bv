import { test } from "node:test";
import assert from "node:assert/strict";
import { hashResetToken } from "../src/lib/resetTokenHash.js";

test("hashResetToken is deterministic for the same input", () => {
  assert.equal(hashResetToken("abc123"), hashResetToken("abc123"));
});

test("hashResetToken produces different hashes for different tokens", () => {
  assert.notEqual(hashResetToken("token-one"), hashResetToken("token-two"));
});

test("hashResetToken never returns the raw input", () => {
  assert.notEqual(hashResetToken("abc123"), "abc123");
});

test("hashResetToken returns a 64-character hex string (SHA-256)", () => {
  assert.match(hashResetToken("abc123"), /^[0-9a-f]{64}$/);
});
