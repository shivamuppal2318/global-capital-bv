// Exa Search — https://exa.ai. No account available here; endpoint and
// response shape below are written from their public docs and NOT
// verified against a live call. Adjust normalizeExaResult() against a real
// response before relying on this.
const REQUIRED_ENV = "EXA_API_KEY";

export function isExaConfigured() {
  return Boolean(process.env[REQUIRED_ENV]);
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
  if (!isExaConfigured()) {
    throw new Error(`Exa Search is not configured — set ${REQUIRED_ENV}.`);
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env[REQUIRED_ENV] },
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
