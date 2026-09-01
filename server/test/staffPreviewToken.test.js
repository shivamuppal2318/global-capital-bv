import { test, before } from "node:test";
import assert from "node:assert/strict";
import { signStaffPreviewToken, verifyStaffPreviewToken } from "../src/lib/staffPreviewToken.js";

before(() => {
  process.env.CLIENT_PORTAL_SECRET = "test-secret";
});

test("a token signed for a lead verifies against that same lead id", () => {
  const token = signStaffPreviewToken("lead-abc");
  assert.equal(verifyStaffPreviewToken(token), "lead-abc");
});

test("a token signed for one lead does not verify for a different lead", () => {
  const token = signStaffPreviewToken("lead-abc");
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [, expiresAtStr, sig] = decoded.split(".");
  const forged = Buffer.from(`lead-xyz.${expiresAtStr}.${sig}`).toString("base64url");
  assert.equal(verifyStaffPreviewToken(forged), null);
});

test("a tampered token fails verification", () => {
  const token = signStaffPreviewToken("lead-abc");
  const tampered = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
  assert.equal(verifyStaffPreviewToken(tampered), null);
});

test("verifyStaffPreviewToken rejects missing/empty/wrong-type tokens without throwing", () => {
  assert.equal(verifyStaffPreviewToken(undefined), null);
  assert.equal(verifyStaffPreviewToken(""), null);
  assert.equal(verifyStaffPreviewToken(null), null);
});

test("an expired token fails verification", () => {
  const originalNow = Date.now;
  Date.now = () => originalNow() - 20 * 60 * 1000; // sign as if 20 minutes ago
  const token = signStaffPreviewToken("lead-abc");
  Date.now = originalNow;

  assert.equal(verifyStaffPreviewToken(token), null);
});
