// Real LLM call (per explicit choice over a rule-based heuristic) — uses
// the Claude Messages API. No ANTHROPIC_API_KEY is configured in this
// environment, so the actual network call has never run; the prompt
// format and response-parsing below ARE fully tested against realistic
// mock model output, just not against a real model response.
const REQUIRED_ENV = "ANTHROPIC_API_KEY";
const VALID_SIGNAL_TYPES = ["FUNDING", "ACQUISITION", "EXPANSION", "LEADERSHIP_CHANGE", "DISTRESS", "OTHER"];

export function isAiProcessorConfigured() {
  return Boolean(process.env[REQUIRED_ENV]);
}

// Pure — testable without any network access or API key.
export function buildProcessingPrompt(rawSignal) {
  return `You are analyzing a news/web signal for a private equity deal-sourcing CRM. Extract the following from the article below.

Title: ${rawSignal.rawTitle}
Content: ${rawSignal.rawContent.slice(0, 4000)}

Return ONLY valid JSON, no other text, in exactly this shape:
{"entityName": "the primary company this signal is about", "signalType": one of ${JSON.stringify(VALID_SIGNAL_TYPES)}, "relevanceScore": integer 0-100 (how relevant this is to a PE firm sourcing deals), "summary": "one sentence summary"}`;
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
  if (typeof parsed.relevanceScore !== "number" || parsed.relevanceScore < 0 || parsed.relevanceScore > 100) {
    throw new Error(`AI response has an invalid relevanceScore: ${parsed.relevanceScore}`);
  }

  return {
    entityName: parsed.entityName.trim(),
    signalType: parsed.signalType,
    relevanceScore: Math.round(parsed.relevanceScore),
    summary: typeof parsed.summary === "string" ? parsed.summary : ""
  };
}

export async function processSignalWithAi(rawSignal) {
  if (!isAiProcessorConfigured()) {
    throw new Error(`AI processor is not configured — set ${REQUIRED_ENV}.`);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env[REQUIRED_ENV],
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [{ role: "user", content: buildProcessingPrompt(rawSignal) }]
    })
  });

  if (!response.ok) {
    throw new Error(`AI processor request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text ?? "";
  return parseProcessingResponse(text);
}
