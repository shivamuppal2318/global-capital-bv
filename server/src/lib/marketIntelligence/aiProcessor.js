// Real LLM call (per explicit choice over a rule-based heuristic) — uses
// the Claude Messages API. Credentials come from Admin Panel → AI
// Assistant, falling back to ANTHROPIC_API_KEY (see lib/aiSettings.js).
// The prompt format and response-parsing below are fully tested against
// realistic mock model output.
import { getAiConfig, isAiConfigured, extractResponseText } from "../aiSettings.js";
import { getScoringCriteria, computeRelevanceScore } from "../scoringCriteria.js";

const VALID_SIGNAL_TYPES = ["FUNDING", "ACQUISITION", "EXPANSION", "LEADERSHIP_CHANGE", "DISTRESS", "OTHER"];

export function isAiProcessorConfigured() {
  return isAiConfigured();
}

// The AI only ever extracts facts — which signal type, and three yes/no
// flags — never a raw 0-100 number itself. relevanceScore is computed
// afterwards, deterministically, from admin-editable points (Admin Panel →
// Market Intelligence → Signal scoring, see lib/scoringCriteria.js). That
// split is what makes "why did this score 82" answerable, and what lets an
// admin retune scoring without touching this prompt or redeploying.
function buildFlagQuestions(criteria) {
  const label = (key) => criteria.find((c) => c.key === key)?.label ?? key;
  return `Also determine these three yes/no facts:
- hasConcreteDetail: ${label("HAS_CONCRETE_DETAIL")}?
- hasRealContent: ${label("HAS_REAL_CONTENT")}?
- entityClearlyNamed: ${label("ENTITY_CLEARLY_NAMED")}?`;
}

// Pure — testable without any network access or API key. `criteria` is
// optional (defaults used when omitted) purely so the existing tests below
// don't all need to construct a criteria list just to check title/content
// interpolation.
export function buildProcessingPrompt(rawSignal, criteria = []) {
  return `You are analyzing a news/web signal for a private equity deal-sourcing CRM. Extract the following from the article below.

Title: ${rawSignal.rawTitle}
Content: ${rawSignal.rawContent.slice(0, 4000)}

If Content adds nothing beyond Title (they're the same or nearly so), base your answer on the headline alone — do not invent a deal size, valuation, investor names, or other specifics that aren't actually stated. That also means hasConcreteDetail and hasRealContent should both be false in that case.

${buildFlagQuestions(criteria)}

Return ONLY valid JSON, no other text, in exactly this shape:
{"entityName": "the primary company this signal is about", "signalType": one of ${JSON.stringify(VALID_SIGNAL_TYPES)}, "hasConcreteDetail": boolean, "hasRealContent": boolean, "entityClearlyNamed": boolean, "summary": "one sentence summary, stating only what the headline/content actually says"}`;
}

// Pure — testable with any mock LLM response string, real or fabricated.
// LLMs sometimes wrap JSON in markdown code fences despite instructions —
// stripped defensively rather than trusting the model to always comply.
export function parseProcessingResponse(rawResponseText) {
  const cleaned = rawResponseText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI processor returned non-JSON response: ${rawResponseText.slice(0, 200)}`);
  }

  if (!parsed.entityName || typeof parsed.entityName !== "string") {
    throw new Error("AI response missing a valid entityName.");
  }
  if (!VALID_SIGNAL_TYPES.includes(parsed.signalType)) {
    throw new Error(`AI response has an invalid signalType: ${parsed.signalType}`);
  }
  for (const flag of ["hasConcreteDetail", "hasRealContent", "entityClearlyNamed"]) {
    if (typeof parsed[flag] !== "boolean") {
      throw new Error(`AI response has an invalid ${flag}: ${parsed[flag]}`);
    }
  }

  return {
    entityName: parsed.entityName.trim(),
    signalType: parsed.signalType,
    hasConcreteDetail: parsed.hasConcreteDetail,
    hasRealContent: parsed.hasRealContent,
    entityClearlyNamed: parsed.entityClearlyNamed,
    summary: typeof parsed.summary === "string" ? parsed.summary : ""
  };
}

export async function processSignalWithAi(rawSignal) {
  const { apiKey, model } = await getAiConfig();
  if (!apiKey) {
    throw new Error("AI processor is not configured — add a Claude API key under Admin Panel → AI Assistant.");
  }

  const criteria = await getScoringCriteria();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: buildProcessingPrompt(rawSignal, criteria) }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI processor request failed: ${response.status}`);
  }

  const data = await response.json();
  const extracted = parseProcessingResponse(extractResponseText(data));

  return {
    entityName: extracted.entityName,
    signalType: extracted.signalType,
    relevanceScore: computeRelevanceScore(criteria, extracted),
    summary: extracted.summary
  };
}
