// Exa Search — https://exa.ai. Verified against a real live call
// (2026-08-22): response shape matches exactly, real results return full
// article text (thousands of words), not just a headline/snippet.
import { getProviderKey, isProviderConfigured } from "../../marketIntelligenceSettings.js";

export async function isExaConfigured() {
  return isProviderConfigured("exa");
}

// Pure — testable without any network access or API key.
export function normalizeExaResult(result) {
  return {
    source: "EXA",
    sourceUrl: result.url,
    rawTitle: result.title ?? result.url,
    rawContent: result.text ?? result.title ?? "",
    rawPublishedAt: result.publishedDate ? new Date(result.publishedDate) : null
  };
}

export async function fetchExaSignals({ query = "company acquisition funding round" } = {}) {
  const { apiKey } = await getProviderKey("exa");
  if (!apiKey) {
    throw new Error("Exa Search is not configured — add a key under Admin Panel → Market Intelligence.");
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      numResults: 25,
      type: "neural",
      contents: { text: true }
    })
  });

  if (!response.ok) {
    throw new Error(`Exa Search request failed: ${response.status}`);
  }

  const data = await response.json();
  const results = data?.results ?? [];
  return results.map(normalizeExaResult);
}
