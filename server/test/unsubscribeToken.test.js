import { test, before } from "node:test";
import assert from "node:assert/strict";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/unsubscribeToken.js";

// The secret is read lazily (inside the function, not at import time), so
// setting it in a before() hook — which runs before any test body — is
// sufficient regardless of when the module itself was imported.
before(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

test("a token signed for a lead verifies against that same lead id", () => {
  const token = signUnsubscribeToken("lead-abc");
  assert.equal(verifyUnsubscribeToken("lead-abc", token), true);
});

test("a token signed for one lead does not verify for a different lead", () => {
  const token = signUnsubscribeToken("lead-abc");
  assert.equal(verifyUnsubscribeToken("lead-xyz", token), false);
});

test("a tampered token fails verification", () => {
  const token = signUnsubscribeToken("lead-abc");
  const tampered = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
  assert.equal(verifyUnsubscribeToken("lead-abc", tampered), false);
});

test("verifyUnsubscribeToken rejects missing/empty/wrong-type tokens without throwing", () => {
  assert.equal(verifyUnsubscribeToken("lead-abc", undefined), false);
  assert.equal(verifyUnsubscribeToken("lead-abc", ""), false);
  assert.equal(verifyUnsubscribeToken("lead-abc", null), false);
});

test("verifyUnsubscribeToken rejects a token of the wrong length without throwing", () => {
  assert.equal(verifyUnsubscribeToken("lead-abc", "deadbeef"), false);
});

test("signUnsubscribeToken throws a clear error when UNSUBSCRIBE_SECRET is unset", async (t) => {
  const original = process.env.UNSUBSCRIBE_SECRET;
  delete process.env.UNSUBSCRIBE_SECRET;
  t.after(() => {
    process.env.UNSUBSCRIBE_SECRET = original;
  });

  assert.throws(() => signUnsubscribeToken("lead-abc"), /UNSUBSCRIBE_SECRET is not set/);
});
