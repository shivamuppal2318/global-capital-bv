import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSignalForContext,
  buildChatSystemPrompt,
  parseChatResponse,
  isChatAssistantConfigured
} from "../src/lib/marketIntelligence/chatAssistant.js";

test("formatSignalForContext includes entity name, title, source, status when present", () => {
  const signal = {
    id: "sig-1",
    entityName: "Acme Corp",
    rawTitle: "Acme Corp raises $50M",
    source: "GOOGLE_NEWS",
    status: "PROCESSED",
    signalType: "FUNDING",
    relevanceScore: 85
  };
  const line = formatSignalForContext(signal);
  assert.match(line, /Acme Corp/);
  assert.match(line, /raises \$50M/);
  assert.match(line, /GOOGLE_NEWS/);
  assert.match(line, /PROCESSED/);
  assert.match(line, /FUNDING/);
  assert.match(line, /relevance 85/);
});

test("formatSignalForContext degrades gracefully when unprocessed (no entityName/signalType/score)", () => {
  const signal = { id: "sig-2", rawTitle: "Some headline", source: "GOOGLE_NEWS", status: "FAILED" };
  const line = formatSignalForContext(signal);
  assert.match(line, /Some headline/);
  assert.match(line, /FAILED/);
  assert.ok(!line.includes("undefined"));
  assert.ok(!line.includes("null"));
});

test("buildChatSystemPrompt embeds every signal up to the cap and instructs the model not to invent data", () => {
  const signals = [{ id: "1", rawTitle: "Headline A", source: "GOOGLE_NEWS", status: "FAILED" }];
  const prompt = buildChatSystemPrompt(signals);
  assert.match(prompt, /Headline A/);
  assert.match(prompt, /don't invent/i);
  assert.match(prompt, /1 of 1 total/);
});

test("buildChatSystemPrompt caps context at 40 signals even when more are captured", () => {
  const signals = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, rawTitle: `Headline ${i}`, source: "GOOGLE_NEWS", status: "FAILED" }));
  const prompt = buildChatSystemPrompt(signals);
  assert.match(prompt, /40 of 100 total/);
  assert.ok(!prompt.includes("Headline 41"));
});

test("buildChatSystemPrompt handles zero captured signals without crashing", () => {
  const prompt = buildChatSystemPrompt([]);
  assert.match(prompt, /No market signals have been captured yet/);
});

test("parseChatResponse extracts the text from a well-formed Claude response", () => {
  const data = { content: [{ type: "text", text: "Here are the funding signals I found." }] };
  assert.equal(parseChatResponse(data), "Here are the funding signals I found.");
});

test("parseChatResponse throws on a response with no text content", () => {
  assert.throws(() => parseChatResponse({ content: [] }), /empty response/);
  assert.throws(() => parseChatResponse({}), /empty response/);
});

test("isChatAssistantConfigured reflects ANTHROPIC_API_KEY presence", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(isChatAssistantConfigured(), false);
  process.env.ANTHROPIC_API_KEY = "test-key";
  assert.equal(isChatAssistantConfigured(), true);
  if (original === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = original;
  }
});
