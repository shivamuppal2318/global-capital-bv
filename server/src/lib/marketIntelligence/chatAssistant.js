// Q&A assistant grounded in the real captured MarketSignal rows — lets
// someone ask things like "any renewable energy funding signals this week?"
// instead of scanning the raw table. Same Claude Messages API call pattern
// as aiProcessor.js (and the same REQUIRED_ENV), so it's already wired for
// whichever provider aiProcessor.js gets swapped to later — the prompt/
// parsing here don't care which model produced the reply.
import { getAiConfig, isAiConfigured } from "../aiSettings.js";

const MAX_SIGNALS_IN_CONTEXT = 40;

export function isChatAssistantConfigured() {
  return isAiConfigured();
}

// Pure — one compact line per signal, newest-relevant info only. Keeps the
// prompt small even with 40 signals, and gives the model a stable id to
// reference back if useful.
export function formatSignalForContext(signal) {
  const parts = [
    `[${signal.id}]`,
    signal.entityName ? `${signal.entityName} —` : null,
    signal.rawTitle,
    `(${signal.source}, ${signal.status}${signal.signalType ? `, ${signal.signalType}` : ""}${
      signal.relevanceScore != null ? `, relevance ${signal.relevanceScore}` : ""
    })`
  ].filter(Boolean);
  return parts.join(" ");
}

// Pure — testable without any network access or API key.
export function buildChatSystemPrompt(signals) {
  const recent = signals.slice(0, MAX_SIGNALS_IN_CONTEXT);
  const contextBlock = recent.length
    ? recent.map(formatSignalForContext).join("\n")
    : "No market signals have been captured yet.";

  return `You are the market intelligence assistant inside Global Capital BV's deal-sourcing CRM. Answer questions ONLY using the captured signals listed below — don't invent companies, deals, or news that aren't in this list. If nothing in the list answers the question, say so plainly rather than guessing. Keep answers short and concrete; reference signal titles/companies by name, not by their [id].

Captured signals (${recent.length} of ${signals.length} total, most recent first):
${contextBlock}`;
}

// Pure — testable with any mock LLM response shape.
export function parseChatResponse(data) {
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("AI processor returned an empty response.");
  }
  return text.trim();
}

export async function askChatAssistant(message, { signals = [], history = [] } = {}) {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) {
    throw new Error("AI processor is not configured — add a Claude API key under Admin Panel → AI Assistant.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system: buildChatSystemPrompt(signals),
      messages: [...history, { role: "user", content: message }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI processor request failed: ${response.status}`);
  }

  const data = await response.json();
  return parseChatResponse(data);
}
