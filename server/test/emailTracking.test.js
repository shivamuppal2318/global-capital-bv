import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { trackingPixelUrl, trackingClickUrl, injectTrackingPixel, wrapLinksForClickTracking } from "../src/lib/emailTracking.js";

let originalSecret, originalBase;
before(() => {
  originalSecret = process.env.TRACKING_SECRET;
  originalBase = process.env.APP_BASE_URL;
  process.env.TRACKING_SECRET = "test-tracking-secret";
  process.env.APP_BASE_URL = "https://crm.example.com";
});
after(() => {
  process.env.TRACKING_SECRET = originalSecret;
  process.env.APP_BASE_URL = originalBase;
});

test("trackingPixelUrl builds a URL under /track/open/ with the activity id and a signed token", () => {
  const url = trackingPixelUrl("activity-123");
  assert.match(url, /^https:\/\/crm\.example\.com\/track\/open\/activity-123\/[0-9a-f]{64}$/);
});

test("trackingClickUrl builds a URL under /track/click/ carrying the encoded destination", () => {
  const url = trackingClickUrl("activity-123", "https://calendly.com/globalcapitalbv/intro-call");
  assert.match(url, /^https:\/\/crm\.example\.com\/track\/click\/activity-123\/[0-9a-f]{64}\?url=/);
  assert.ok(url.includes(encodeURIComponent("https://calendly.com/globalcapitalbv/intro-call")));
});

test("injectTrackingPixel inserts the pixel just before </body>", () => {
  const html = "<html><body><p>Hi</p></body></html>";
  const result = injectTrackingPixel(html, "activity-123");
  assert.match(result, /<img src="https:\/\/crm\.example\.com\/track\/open\/activity-123\/[0-9a-f]{64}" width="1" height="1"[^>]*\/><\/body>/);
});

test("injectTrackingPixel appends to the end when there's no </body> tag", () => {
  const html = "<p>Just a fragment</p>";
  const result = injectTrackingPixel(html, "activity-123");
  assert.ok(result.startsWith(html));
  assert.match(result, /<img src="https:\/\/crm\.example\.com\/track\/open\//);
});

test("wrapLinksForClickTracking rewrites http(s) links to go through the click-tracking redirect", () => {
  const html = '<a href="https://calendly.com/intro">Book a call</a>';
  const result = wrapLinksForClickTracking(html, "activity-123");
  assert.match(result, /href="https:\/\/crm\.example\.com\/track\/click\/activity-123\/[0-9a-f]{64}\?url=/);
  assert.ok(result.includes(encodeURIComponent("https://calendly.com/intro")));
});

test("wrapLinksForClickTracking rewrites multiple links independently", () => {
  const html = '<a href="https://a.com/x">A</a> and <a href="https://b.com/y">B</a>';
  const result = wrapLinksForClickTracking(html, "activity-123");
  assert.ok(result.includes(encodeURIComponent("https://a.com/x")));
  assert.ok(result.includes(encodeURIComponent("https://b.com/y")));
});

test("wrapLinksForClickTracking leaves the unsubscribe link untouched when skipUrl matches", () => {
  const unsubUrl = "https://crm.example.com/unsubscribe/lead-1/token";
  const html = `<a href="${unsubUrl}">Unsubscribe</a> <a href="https://calendly.com/x">Book</a>`;
  const result = wrapLinksForClickTracking(html, "activity-123", { skipUrl: unsubUrl });
  assert.ok(result.includes(`href="${unsubUrl}"`));
  assert.ok(result.includes(encodeURIComponent("https://calendly.com/x")));
});

test("wrapLinksForClickTracking leaves html with no links unchanged", () => {
  const html = "<p>No links here.</p>";
  assert.equal(wrapLinksForClickTracking(html, "activity-123"), html);
});
