import { test } from "node:test";
import assert from "node:assert/strict";
import { extractResponseText } from "../src/lib/aiSettings.js";

// The real bug this guards against: extended-thinking models put a
// { type: "thinking" } block BEFORE the reply, so content[0] is not
// reliably the answer — grabbing content[0].text directly returned
// undefined for every real call against this account, which surfaced as
// "AI processor returned an empty response" 100% of the time, not just
// intermittently.
test("extractResponseText finds the text block when it's NOT content[0] (the real observed shape)", () => {
  const data = {
    content: [
      { type: "thinking", thinking: "", signature: "abc123" },
      { type: "text", text: "Here is the answer." }
    ]
  };
  assert.equal(extractResponseText(data), "Here is the answer.");
});

test("extractResponseText still works when the text block IS content[0]", () => {
  const data = { content: [{ type: "text", text: "Answer first." }] };
  assert.equal(extractResponseText(data), "Answer first.");
});

test("extractResponseText returns an empty string when there's no text block at all", () => {
  assert.equal(extractResponseText({ content: [{ type: "thinking", thinking: "only this" }] }), "");
  assert.equal(extractResponseText({ content: [] }), "");
  assert.equal(extractResponseText({}), "");
  assert.equal(extractResponseText(null), "");
});
