import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { signInterestToken, verifyInterestToken } from "../src/lib/interestToken.js";

let originalSecret;
before(() => {
  originalSecret = process.env.INTEREST_SIGN_SECRET;
  process.env.INTEREST_SIGN_SECRET = "test-interest-secret";
});
after(() => {
  process.env.INTEREST_SIGN_SECRET = originalSecret;
});

test("a token signed for a lead verifies against that same lead id", () => {
  const token = signInterestToken("lead-abc");
  assert.equal(verifyInterestToken("lead-abc", token), true);
});

test("a token signed for one lead does not verify for a different lead", () => {
  const token = signInterestToken("lead-abc");
  assert.equal(verifyInterestToken("lead-xyz", token), false);
});

test("a tampered token fails verification", () => {
  const token = signInterestToken("lead-abc");
  const tampered = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
  assert.equal(verifyInterestToken("lead-abc", tampered), false);
});

test("verifyInterestToken rejects missing/empty/wrong-type tokens without throwing", () => {
  assert.equal(verifyInterestToken("lead-abc", undefined), false);
  assert.equal(verifyInterestToken("lead-abc", ""), false);
  assert.equal(verifyInterestToken("lead-abc", null), false);
});

test("verifyInterestToken rejects a token of the wrong length without throwing", () => {
  assert.equal(verifyInterestToken("lead-abc", "deadbeef"), false);
});

test("signInterestToken throws a clear error when INTEREST_SIGN_SECRET is unset", () => {
  const original = process.env.INTEREST_SIGN_SECRET;
  delete process.env.INTEREST_SIGN_SECRET;
  try {
    assert.throws(() => signInterestToken("lead-abc"), /INTEREST_SIGN_SECRET is not set/);
  } finally {
    process.env.INTEREST_SIGN_SECRET = original;
  }
});
