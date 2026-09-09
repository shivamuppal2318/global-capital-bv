import { fetchExaSignals } from "./marketIntelligence/sources/exaSource.js";
import { fetchNewsApiSignals } from "./marketIntelligence/sources/newsApiSource.js";
import { apolloLookupCompany } from "./marketIntelligence/sources/apolloSource.js";
import { fetchFirecrawlSignals } from "./marketIntelligence/sources/firecrawlSource.js";

// Cheapest real call per provider that proves the key actually works — not
// just that it looks well-formed. Mirrors aiSettings.js's testAiConnection().
export async function testProviderConnection(provider) {
  try {
    if (provider === "exa") {
      const results = await fetchExaSignals({ query: "test connection" });
      return { success: true, message: `Connected — Exa returned ${results.length} result(s).` };
    }
    if (provider === "newsapi") {
      const results = await fetchNewsApiSignals({ query: "test connection" });
      return { success: true, message: `Connected — NewsAPI.ai returned ${results.length} result(s).` };
    }
    if (provider === "apollo") {
      const result = await apolloLookupCompany("Microsoft");
      return { success: true, message: `Connected — Apollo found "${result.companyName}".` };
    }
    if (provider === "firecrawl") {
      const results = await fetchFirecrawlSignals({ urls: ["https://example.com"] });
      return { success: true, message: `Connected — Firecrawl scraped ${results.length} page(s).` };
    }
    return { success: false, message: `Unknown provider: ${provider}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}
