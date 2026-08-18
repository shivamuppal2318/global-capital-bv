import { test } from "node:test";
import assert from "node:assert/strict";
import { fillMergeFields, renderEmail } from "../src/lib/renderTemplate.js";

test("fillMergeFields substitutes known fields", () => {
  assert.equal(
    fillMergeFields("Hi {{leadName}} from {{company}}.", { leadName: "Deepa", company: "Nordwind" }),
    "Hi Deepa from Nordwind."
  );
});

test("fillMergeFields leaves unknown placeholders visible rather than dropping them", () => {
  assert.equal(fillMergeFields("Hi {{missingField}}.", {}), "Hi {{missingField}}.");
});

test("fillMergeFields tolerates whitespace inside braces", () => {
  assert.equal(fillMergeFields("Hi {{ leadName }}.", { leadName: "Deepa" }), "Hi Deepa.");
});

test("renderEmail merges subject and body", () => {
  const result = renderEmail(
    { subject: "Hi {{leadName}}", body: "Thanks {{leadName}} from {{company}}." },
    { leadName: "Deepa", company: "Nordwind" }
  );
  assert.equal(result.subject, "Hi Deepa");
  assert.ok(result.body.startsWith("Thanks Deepa from Nordwind."));
});

test("renderEmail appends a plain-text unsubscribe footer when unsubscribeUrl is provided", () => {
  const result = renderEmail(
    { subject: "Hi", body: "Thanks." },
    { unsubscribeUrl: "https://example.com/unsubscribe/abc" }
  );
  assert.match(result.body, /Unsubscribe: https:\/\/example\.com\/unsubscribe\/abc/);
});

test("renderEmail does not append a footer when unsubscribeUrl is absent", () => {
  const result = renderEmail({ subject: "Hi", body: "Thanks." }, {});
  assert.equal(result.body, "Thanks.");
});

test("renderEmail auto-wraps plain body in branded HTML when template.html is absent", () => {
  const result = renderEmail(
    { subject: "Hi", body: "Line one.\n\nLine two." },
    { unsubscribeUrl: "https://example.com/unsub" }
  );
  assert.match(result.html, /<!doctype html>/i);
  assert.match(result.html, /Line one\./);
  assert.match(result.html, /Line two\./);
  assert.match(result.html, /https:\/\/example\.com\/unsub/);
  assert.match(result.html, /Unsubscribe/);
});

test("renderEmail escapes HTML-unsafe characters from plain-text body", () => {
  const result = renderEmail({ subject: "Hi", body: "<script>alert(1)</script> & co" }, {});
  assert.ok(!result.html.includes("<script>"));
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /&amp; co/);
});

test("renderEmail uses template.html verbatim (merged) when provided instead of auto-wrapping", () => {
  const result = renderEmail(
    { subject: "Hi", body: "ignored for html", html: "<p>Custom {{leadName}}</p>" },
    { leadName: "Deepa" }
  );
  assert.equal(result.html, "<p>Custom Deepa</p>");
});
