import { test } from "node:test";
import assert from "node:assert/strict";
import { matchReplyRule, classifyReply, replyRules } from "../src/lib/replyClassifier.js";

test("matchReplyRule returns null for empty/falsy input", () => {
  assert.equal(matchReplyRule(""), null);
  assert.equal(matchReplyRule(null), null);
  assert.equal(matchReplyRule(undefined), null);
});

test("matchReplyRule matches NDA keyword case-insensitively", () => {
  const rule = matchReplyRule("Please send the NDA so we can sign.");
  assert.equal(rule.id, "nda");
});

test("matchReplyRule matches zoom/call keywords", () => {
  assert.equal(matchReplyRule("Can we do a Zoom call first?").id, "zoom");
  assert.equal(matchReplyRule("Let's schedule a call next week.").id, "zoom");
});

test("matchReplyRule matches info-request keywords", () => {
  assert.equal(matchReplyRule("Please share the brochure and deck.").id, "info");
  assert.equal(matchReplyRule("Need a bit more detail please.").id, "info");
});

test("matchReplyRule returns null when nothing matches", () => {
  assert.equal(matchReplyRule("Thanks, not interested right now."), null);
});

test("matchReplyRule respects rule priority order (first match wins)", () => {
  // Contains both an nda keyword ("sign") and a zoom keyword ("call") — nda
  // rule is declared first in replyRules, so it should win.
  const text = "Let's call to discuss, then I'll sign.";
  assert.equal(matchReplyRule(text).id, replyRules[0].id);
});

test("classifyReply maps matched rule to its replyType", () => {
  assert.equal(classifyReply("send the NDA"), "INTERESTED");
  assert.equal(classifyReply("let's zoom"), "ZOOM_REQUEST");
  assert.equal(classifyReply("send the deck"), "INFO_REQUEST");
});

test("classifyReply falls back to OTHER when nothing matches -- a real reply happened, so NO_REPLY would be a lie", () => {
  assert.equal(classifyReply("no thanks"), "OTHER");
  assert.equal(classifyReply("Ok"), "OTHER");
  assert.equal(classifyReply(""), "OTHER");
});
