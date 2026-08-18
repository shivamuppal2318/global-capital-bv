import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildProcessingPrompt, parseProcessingResponse, isAiProcessorConfigured } from "../src/lib/marketIntelligence/aiProcessor.js";

test("buildProcessingPrompt includes the article title and content", () => {
  const prompt = buildProcessingPrompt({ rawTitle: "Acme raises $50M", rawContent: "Acme Corp announced today..." });
  assert.match(prompt, /Acme raises \$50M/);
  assert.match(prompt, /Acme Corp announced today/);
});

test("buildProcessingPrompt truncates very long content to 4000 chars", () => {
  const longContent = "x".repeat(10000);
  const prompt = buildProcessingPrompt({ rawTitle: "T", rawContent: longContent });
  // the prompt contains other text too, but the included slice of content
  // should not exceed 4000 chars of the original "x" run
  const xRunLength = (prompt.match(/x+/) ?? [""])[0].length;
  assert.ok(xRunLength <= 4000);
});

test("parseProcessingResponse parses a well-formed JSON response", () => {
  const response = JSON.stringify({
    entityName: "Acme Corp",
    signalType: "FUNDING",
    relevanceScore: 85,
    summary: "Acme raised a $50M Series B."
  });
  const result = parseProcessingResponse(response);
  assert.deepEqual(result, {
    entityName: "Acme Corp",
    signalType: "FUNDING",
    relevanceScore: 85,
    summary: "Acme raised a $50M Series B."
  });
});

test("parseProcessingResponse strips markdown code fences some models wrap JSON in", () => {
  const response = "```json\n" + JSON.stringify({ entityName: "Acme", signalType: "OTHER", relevanceScore: 10, summary: "x" }) + "\n```";
  const result = parseProcessingResponse(response);
  assert.equal(result.entityName, "Acme");
});

test("parseProcessingResponse rounds a non-integer relevanceScore", () => {
  const response = JSON.stringify({ entityName: "Acme", signalType: "OTHER", relevanceScore: 72.6, summary: "x" });
  assert.equal(parseProcessingResponse(response).relevanceScore, 73);
});

test("parseProcessingResponse defaults summary to empty string when absent", () => {
  const response = JSON.stringify({ entityName: "Acme", signalType: "OTHER", relevanceScore: 50 });
  assert.equal(parseProcessingResponse(response).summary, "");
});

test("parseProcessingResponse throws on non-JSON text", () => {
  assert.throws(() => parseProcessingResponse("Sorry, I can't help with that."), /non-JSON response/);
});

test("parseProcessingResponse throws when entityName is missing", () => {
  const response = JSON.stringify({ signalType: "OTHER", relevanceScore: 50, summary: "x" });
  assert.throws(() => parseProcessingResponse(response), /entityName/);
});

test("parseProcessingResponse throws on an invalid signalType", () => {
  const response = JSON.stringify({ entityName: "Acme", signalType: "MADE_UP_TYPE", relevanceScore: 50, summary: "x" });
  assert.throws(() => parseProcessingResponse(response), /invalid signalType/);
});

test("parseProcessingResponse throws when relevanceScore is out of 0-100 range", () => {
  const tooHigh = JSON.stringify({ entityName: "Acme", signalType: "OTHER", relevanceScore: 150, summary: "x" });
  const negative = JSON.stringify({ entityName: "Acme", signalType: "OTHER", relevanceScore: -5, summary: "x" });
  assert.throws(() => parseProcessingResponse(tooHigh), /invalid relevanceScore/);
  assert.throws(() => parseProcessingResponse(negative), /invalid relevanceScore/);
});

test("isAiProcessorConfigured reflects ANTHROPIC_API_KEY presence", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(isAiProcessorConfigured(), false);
  process.env.ANTHROPIC_API_KEY = "test-key";
  assert.equal(isAiProcessorConfigured(), true);
  if (original === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = original;
  }
});
