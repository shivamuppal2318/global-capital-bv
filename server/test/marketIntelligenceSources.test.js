import "dotenv/config";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { normalizeNewsApiArticle, isNewsApiConfigured } from "../src/lib/marketIntelligence/sources/newsApiSource.js";
import { normalizeExaResult, isExaConfigured } from "../src/lib/marketIntelligence/sources/exaSource.js";
import { normalizeFirecrawlPage, isFirecrawlConfigured } from "../src/lib/marketIntelligence/sources/firecrawlSource.js";
import { normalizeApolloOrganization, summarizeApolloEnrichment, isApolloConfigured } from "../src/lib/marketIntelligence/sources/apolloSource.js";
import { parseGoogleNewsRss, isGoogleNewsConfigured } from "../src/lib/marketIntelligence/sources/googleNewsRssSource.js";
import { invalidateMarketIntelSettingsCache, getMarketIntelSettingsRow } from "../src/lib/marketIntelligenceSettings.js";
import { initEncryptionKey } from "../src/lib/credentialCrypto.js";

// Real Admin Panel-saved provider keys are encrypted with the app's actual
// ENCRYPTION_KEY (from .env, loaded above) — not a test-only fake one, since
// a stored key from real use (see the isConfigured test below) must
// genuinely decrypt, not just round-trip within this test file.
before(async () => {
  await initEncryptionKey();
});

test("normalizeNewsApiArticle maps to the common signal shape", () => {
  const article = { url: "https://news.example.com/a", title: "Acme raises $50M", body: "Full body text", dateTimePub: "2026-01-01 12:00:00" };
  const signal = normalizeNewsApiArticle(article);
  assert.equal(signal.source, "NEWSAPI");
  assert.equal(signal.sourceUrl, "https://news.example.com/a");
  assert.equal(signal.rawTitle, "Acme raises $50M");
  assert.equal(signal.rawContent, "Full body text");
  assert.ok(signal.rawPublishedAt instanceof Date);
});

test("normalizeNewsApiArticle falls back to title when body is missing", () => {
  const signal = normalizeNewsApiArticle({ url: "https://x.com", title: "Headline only" });
  assert.equal(signal.rawContent, "Headline only");
  assert.equal(signal.rawPublishedAt, null);
});

test("normalizeExaResult maps to the common signal shape", () => {
  const result = { url: "https://x.com/a", title: "Some article", text: "Body text", publishedDate: "2026-02-01" };
  const signal = normalizeExaResult(result);
  assert.equal(signal.source, "EXA");
  assert.equal(signal.rawContent, "Body text");
  assert.ok(signal.rawPublishedAt instanceof Date);
});

test("normalizeExaResult falls back to url when title is missing", () => {
  const signal = normalizeExaResult({ url: "https://x.com/a" });
  assert.equal(signal.rawTitle, "https://x.com/a");
  assert.equal(signal.rawContent, "");
});

test("normalizeFirecrawlPage maps to the common signal shape and has no published date", () => {
  const page = { metadata: { title: "Press release" }, markdown: "# Content" };
  const signal = normalizeFirecrawlPage(page, "https://company.com/press");
  assert.equal(signal.source, "FIRECRAWL");
  assert.equal(signal.sourceUrl, "https://company.com/press");
  assert.equal(signal.rawTitle, "Press release");
  assert.equal(signal.rawContent, "# Content");
  assert.equal(signal.rawPublishedAt, null);
});

test("normalizeApolloOrganization maps org + contact to the common shape", () => {
  const org = { name: "Acme Corp", primary_domain: "acme.com" };
  const contact = { first_name: "Jane", last_name: "Doe", email: "jane@acme.com", title: "CEO" };
  const result = normalizeApolloOrganization(org, contact);
  assert.equal(result.companyName, "Acme Corp");
  assert.equal(result.domain, "acme.com");
  assert.deepEqual(result.contact, { name: "Jane Doe", email: "jane@acme.com", title: "CEO", linkedinUrl: null });
});

test("normalizeApolloOrganization handles a missing contact", () => {
  const result = normalizeApolloOrganization({ name: "Acme Corp" }, null);
  assert.equal(result.contact, null);
});

test("normalizeApolloOrganization extracts full company enrichment: industry, size, revenue, founding year, location", () => {
  const org = {
    name: "Acme Corp",
    primary_domain: "acme.com",
    industry: "Renewable Energy",
    estimated_num_employees: 250,
    annual_revenue: 42000000,
    founded_year: 2015,
    city: "Amsterdam",
    state: "North Holland",
    country: "Netherlands",
    linkedin_url: "https://linkedin.com/company/acme"
  };
  const result = normalizeApolloOrganization(org, null);
  assert.equal(result.industry, "Renewable Energy");
  assert.equal(result.estimatedEmployeeCount, 250);
  assert.equal(result.estimatedAnnualRevenue, 42000000);
  assert.equal(result.foundedYear, 2015);
  assert.equal(result.location, "Amsterdam, North Holland, Netherlands");
  assert.equal(result.linkedinUrl, "https://linkedin.com/company/acme");
});

test("normalizeApolloOrganization leaves enrichment fields null when the org has none of them", () => {
  const result = normalizeApolloOrganization({ name: "Bare Co" }, null);
  assert.equal(result.industry, null);
  assert.equal(result.estimatedEmployeeCount, null);
  assert.equal(result.estimatedAnnualRevenue, null);
  assert.equal(result.foundedYear, null);
  assert.equal(result.location, null);
});

test("normalizeApolloOrganization builds location from partial city/country (state missing)", () => {
  const result = normalizeApolloOrganization({ name: "Co", city: "Berlin", country: "Germany" }, null);
  assert.equal(result.location, "Berlin, Germany");
});

test("summarizeApolloEnrichment renders a readable summary of the enriched fields", () => {
  const enrichment = {
    industry: "Renewable Energy",
    estimatedEmployeeCount: 250,
    estimatedAnnualRevenue: 42000000,
    foundedYear: 2015,
    location: "Amsterdam, Netherlands",
    domain: "acme.com"
  };
  const summary = summarizeApolloEnrichment(enrichment);
  assert.match(summary, /Renewable Energy/);
  assert.match(summary, /250 employees/);
  assert.match(summary, /Founded 2015/);
  assert.match(summary, /Amsterdam, Netherlands/);
  assert.match(summary, /acme\.com/);
});

test("summarizeApolloEnrichment handles an org with no enrichment data at all", () => {
  const summary = summarizeApolloEnrichment({ industry: null, estimatedEmployeeCount: null, estimatedAnnualRevenue: null, foundedYear: null, location: null, domain: null });
  assert.equal(summary, "No additional company details returned by Apollo.");
});

test("isGoogleNewsConfigured is always true — no API key needed for the public RSS feed", () => {
  assert.equal(isGoogleNewsConfigured(), true);
});

const SAMPLE_GOOGLE_NEWS_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>"private equity funding" - Google News</title>
    <item>
      <title>Acme Renewables raises €50M Series B - TechCrunch</title>
      <link>https://news.google.com/rss/articles/CBMi123?oc=5</link>
      <guid isPermaLink="false">CBMi123</guid>
      <pubDate>Mon, 17 Aug 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[<a href="https://news.google.com/rss/articles/CBMi123?oc=5">Acme Renewables raises &euro;50M Series B</a>&nbsp;&nbsp;<font color="#6f6f6f">TechCrunch</font>]]></description>
      <source url="https://techcrunch.com">TechCrunch</source>
    </item>
    <item>
      <title>Bolt Manufacturing acquired by Family Office Group - Reuters</title>
      <link>https://news.google.com/rss/articles/CBMi456?oc=5</link>
      <guid isPermaLink="false">CBMi456</guid>
      <pubDate>Mon, 17 Aug 2026 08:15:00 GMT</pubDate>
      <description><![CDATA[<a href="https://news.google.com/rss/articles/CBMi456?oc=5">Bolt Manufacturing acquired</a>]]></description>
      <source url="https://reuters.com">Reuters</source>
    </item>
  </channel>
</rss>`;

test("parseGoogleNewsRss extracts every <item> into the common signal shape", () => {
  const signals = parseGoogleNewsRss(SAMPLE_GOOGLE_NEWS_RSS);
  assert.equal(signals.length, 2);
  assert.equal(signals[0].source, "GOOGLE_NEWS");
  assert.equal(signals[0].rawTitle, "Acme Renewables raises €50M Series B - TechCrunch");
  assert.equal(signals[0].sourceUrl, "https://news.google.com/rss/articles/CBMi123?oc=5");
  assert.ok(signals[0].rawPublishedAt instanceof Date);
  assert.ok(signals[0].rawContent.includes("Acme Renewables raises"));
});

test("parseGoogleNewsRss decodes XML entities and strips CDATA markers from the description", () => {
  const xml = `<rss><channel><item>
    <title>Bolt &amp; Co secures growth funding</title>
    <link>https://news.google.com/rss/articles/CBMi789</link>
    <description><![CDATA[<a href="https://x.com">Bolt &amp; Co secures growth funding</a>]]></description>
  </item></channel></rss>`;
  const [signal] = parseGoogleNewsRss(xml);
  assert.equal(signal.rawTitle, "Bolt & Co secures growth funding");
  assert.ok(!signal.rawContent.includes("CDATA"));
  assert.ok(!signal.rawContent.includes("&amp;"));
});

test("parseGoogleNewsRss returns an empty array for a feed with no items", () => {
  const signals = parseGoogleNewsRss(`<?xml version="1.0"?><rss><channel><title>Empty</title></channel></rss>`);
  assert.deepEqual(signals, []);
});

test("parseGoogleNewsRss skips an item missing a title or link", () => {
  const xml = `<rss><channel><item><pubDate>Mon, 17 Aug 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  assert.deepEqual(parseGoogleNewsRss(xml), []);
});

// isConfigured() now checks the database first (Admin Panel → Market
// Intelligence, see lib/marketIntelligenceSettings.js) before falling back
// to the env var — same reasoning as the AI key. That DB check means this
// needs a real Postgres connection; skipped rather than failed when only a
// local/non-Postgres DATABASE_URL is available, same as any other test
// that can't reach its dependency.
test("each source's isConfigured() correctly reflects its own env var, unless a real key is already stored in the DB", async (t) => {
  // A provider saved via Admin Panel → Market Intelligence always wins over
  // its env var by design (see marketIntelligenceSettings.js) — so a
  // provider that already has a real DB-stored key (from actual use, not
  // just this test) can't be driven down to "unconfigured" by clearing its
  // env var. That's correct behavior, not something to fight in the test:
  // for those providers, only confirm they still report configured.
  const envVars = { NEWSAPI_AI_KEY: ["newsapi", isNewsApiConfigured], EXA_API_KEY: ["exa", isExaConfigured], FIRECRAWL_API_KEY: ["firecrawl", isFirecrawlConfigured], APOLLO_API_KEY: ["apollo", isApolloConfigured] };
  const fieldByProvider = {
    newsapi: "newsApiKeyEncrypted",
    exa: "exaApiKeyEncrypted",
    firecrawl: "firecrawlApiKeyEncrypted",
    apollo: "apolloApiKeyEncrypted"
  };
  const originals = {};
  for (const key of Object.keys(envVars)) {
    originals[key] = process.env[key];
    delete process.env[key];
  }

  try {
    const row = await getMarketIntelSettingsRow();
    for (const [key, [provider, isConfigured]] of Object.entries(envVars)) {
      if (row?.[fieldByProvider[provider]]) {
        invalidateMarketIntelSettingsCache();
        assert.equal(await isConfigured(), true, `${key} should still report configured via its stored DB key`);
        continue;
      }
      invalidateMarketIntelSettingsCache();
      assert.equal(await isConfigured(), false, `${key} should report unconfigured when unset`);
      process.env[key] = "test-value";
      invalidateMarketIntelSettingsCache();
      assert.equal(await isConfigured(), true, `${key} should report configured when set`);
      delete process.env[key];
    }
  } catch (err) {
    if (err.name === "PrismaClientInitializationError" || err.name === "PrismaClientKnownRequestError") {
      t.skip(`No reachable database for marketIntelSettings lookup: ${err.message.split("\n")[0]}`);
      return;
    }
    throw err;
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    invalidateMarketIntelSettingsCache();
  }
});
