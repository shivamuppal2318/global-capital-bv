// Firecrawl — https://firecrawl.dev. No account available here; endpoint
// and response shape below are written from their public docs and NOT
// verified against a live call. Adjust normalizeFirecrawlPage() against a
// real response before relying on this.
//
// Unlike NewsAPI/Exa (which search/discover), Firecrawl here is used to
// scrape a known list of press/news pages you already care about — so it
// takes explicit URLs rather than a free-text query.
import { getProviderKey, isProviderConfigured } from "../../marketIntelligenceSettings.js";

export async function isFirecrawlConfigured() {
  return isProviderConfigured("firecrawl");
}

// Pure — testable without any network access or API key.
export function normalizeFirecrawlPage(page, sourceUrl) {
  return {
    source: "FIRECRAWL",
    sourceUrl,
    rawTitle: page.metadata?.title ?? sourceUrl,
    rawContent: page.markdown ?? page.content ?? "",
    rawPublishedAt: null // Firecrawl scrapes a page as-is; it doesn't report a publish date
  };
}

export async function fetchFirecrawlSignals({ urls = [] } = {}) {
  const { apiKey } = await getProviderKey("firecrawl");
  if (!apiKey) {
    throw new Error("Firecrawl is not configured — add a key under Admin Panel → Market Intelligence.");
  }
  if (urls.length === 0) {
    return [];
  }

  const results = [];
  for (const url of urls) {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"] })
    });

    if (!response.ok) {
      console.error(`[firecrawl] scrape failed for ${url}: ${response.status}`);
      continue;
    }

    const data = await response.json();
    if (data?.data) {
      results.push(normalizeFirecrawlPage(data.data, url));
    }
  }
  return results;
}
