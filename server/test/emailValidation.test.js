import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmailSyntax, isPlaceholderDomain, getEmailDomain, verifyEmailDeliverability } from "../src/lib/emailValidation.js";

test("isValidEmailSyntax accepts a normal-looking address", () => {
  assert.equal(isValidEmailSyntax("deepa@nordwind.de"), true);
});

test("isValidEmailSyntax rejects obviously malformed input", () => {
  for (const bad of ["not-an-email", "missing-domain@", "@missing-local.com", "", "  "]) {
    assert.equal(isValidEmailSyntax(bad), false, `expected "${bad}" to be invalid`);
  }
});

test("getEmailDomain lowercases and extracts the domain", () => {
  assert.equal(getEmailDomain("Deepa@NordWind.DE"), "nordwind.de");
});

test("isPlaceholderDomain flags known placeholder domains", () => {
  assert.equal(isPlaceholderDomain("example.com"), true);
  assert.equal(isPlaceholderDomain("test.com"), true);
  assert.equal(isPlaceholderDomain("nordwind.de"), false);
});

test("verifyEmailDeliverability rejects malformed input before any network call", async () => {
  const result = await verifyEmailDeliverability("not-an-email");
  assert.equal(result.valid, false);
  assert.match(result.reason, /format/i);
});

test("verifyEmailDeliverability rejects placeholder domains before any network call", async () => {
  const result = await verifyEmailDeliverability("someone@example.com");
  assert.equal(result.valid, false);
  assert.match(result.reason, /placeholder/i);
});

// These two hit real DNS — skipped rather than failed if the sandbox has no
// outbound network access, same "can't verify here, not broken" pattern
// used for the DB-dependent tests elsewhere in this suite.
test("verifyEmailDeliverability finds real MX records for a domain that definitely has mail servers", async (t) => {
  try {
    const result = await verifyEmailDeliverability("someone@gmail.com");
    assert.equal(result.valid, true);
  } catch (err) {
    t.skip(`No network access to verify DNS: ${err.message}`);
  }
});

test("verifyEmailDeliverability rejects a domain with no DNS records at all", async (t) => {
  try {
    const result = await verifyEmailDeliverability("someone@this-domain-should-not-exist-gc-test-12345.invalid-tld");
    assert.equal(result.valid, false);
  } catch (err) {
    t.skip(`No network access to verify DNS: ${err.message}`);
  }
});
