import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { signNdaToken, verifyNdaToken } from "../src/lib/ndaSignToken.js";

let originalSecret;
before(() => {
  originalSecret = process.env.NDA_SIGN_SECRET;
  process.env.NDA_SIGN_SECRET = "test-nda-secret";
});
after(() => {
  process.env.NDA_SIGN_SECRET = originalSecret;
});

test("a token signed for a lead verifies against that same lead id", () => {
  const token = signNdaToken("lead-abc");
  assert.equal(verifyNdaToken("lead-abc", token), true);
});

test("a token signed for one lead does not verify for a different lead", () => {
  const token = signNdaToken("lead-abc");
  assert.equal(verifyNdaToken("lead-xyz", token), false);
});

test("a tampered token fails verification", () => {
  const token = signNdaToken("lead-abc");
  const tampered = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
  assert.equal(verifyNdaToken("lead-abc", tampered), false);
});

test("verifyNdaToken rejects missing/empty/wrong-type tokens without throwing", () => {
  assert.equal(verifyNdaToken("lead-abc", undefined), false);
  assert.equal(verifyNdaToken("lead-abc", ""), false);
  assert.equal(verifyNdaToken("lead-abc", null), false);
});

test("verifyNdaToken rejects a token of the wrong length without throwing", () => {
  assert.equal(verifyNdaToken("lead-abc", "deadbeef"), false);
});

test("signNdaToken throws a clear error when NDA_SIGN_SECRET is unset", () => {
  const original = process.env.NDA_SIGN_SECRET;
  delete process.env.NDA_SIGN_SECRET;
  try {
    assert.throws(() => signNdaToken("lead-abc"), /NDA_SIGN_SECRET is not set/);
  } finally {
    process.env.NDA_SIGN_SECRET = original;
  }
});
