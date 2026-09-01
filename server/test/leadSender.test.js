import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { interestUrlFor, interestButtonHtml, plainTextToHtml } from "../src/lib/leadSender.js";

let originalSecret, originalBase;
before(() => {
  originalSecret = process.env.INTEREST_SIGN_SECRET;
  originalBase = process.env.APP_BASE_URL;
  process.env.INTEREST_SIGN_SECRET = "test-interest-secret";
  process.env.APP_BASE_URL = "https://crm.example.com";
});
after(() => {
  process.env.INTEREST_SIGN_SECRET = originalSecret;
  process.env.APP_BASE_URL = originalBase;
});

test("interestUrlFor builds a URL under /api/interested/ with the lead id and a signed token", () => {
  const url = interestUrlFor("lead-abc");
  assert.match(url, /^https:\/\/crm\.example\.com\/api\/interested\/lead-abc\/[0-9a-f]{64}$/);
});

test("interestButtonHtml embeds the interest URL in a clickable link", () => {
  const html = interestButtonHtml("lead-abc");
  const url = interestUrlFor("lead-abc");
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes("I'm Interested"));
});

test("plainTextToHtml escapes HTML-significant characters", () => {
  const html = plainTextToHtml("Terms < 5% & > 10%");
  assert.ok(html.includes("Terms &lt; 5% &amp; &gt; 10%"));
});

test("plainTextToHtml turns blank-line-separated paragraphs into separate <p> tags", () => {
  const html = plainTextToHtml("First paragraph.\n\nSecond paragraph.");
  const paragraphCount = (html.match(/<p /g) ?? []).length;
  assert.equal(paragraphCount, 2);
  assert.ok(html.includes("First paragraph."));
  assert.ok(html.includes("Second paragraph."));
});

test("plainTextToHtml keeps single newlines within a paragraph as <br>", () => {
  const html = plainTextToHtml("Line one\nLine two");
  assert.ok(html.includes("Line one<br>Line two"));
});
