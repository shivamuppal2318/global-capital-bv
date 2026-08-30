import { runIntelligencePipeline } from "./pipeline.js";
import { isNewsApiConfigured } from "./sources/newsApiSource.js";
import { isExaConfigured } from "./sources/exaSource.js";
import { isFirecrawlConfigured } from "./sources/firecrawlSource.js";
import { isGoogleNewsConfigured } from "./sources/googleNewsRssSource.js";

// News/deal signals don't need minute-level freshness the way an inbound
// email reply does, but a week between runs meant a "seeking funding"
// signal could sit unprocessed for days before anyone saw it — daily is
// the real-world cadence a deal-sourcing report needs. Google News RSS's
// own "when:7d" scope (see googleNewsRssSource.js) is deliberately left
// wider than the run interval, not narrowed to match it: that overlap is
// a safety margin against a missed run (server restart, an outage), and
// costs nothing extra since contentHash dedup already discards anything
// already seen. Tune the cadence via MARKET_INTELLIGENCE_INTERVAL_MS.
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Google News needs no API key, so it alone is enough to make a scheduled
// run worthwhile — without this, the scheduler stayed off in the (common)
// case where nobody's paid for NewsAPI/Exa/Firecrawl yet. Async now that a
// source's key can come from the database (see
// lib/marketIntelligenceSettings.js), not just the environment.
export async function isMarketIntelligenceSchedulerEnabled() {
  if (isGoogleNewsConfigured()) return true;
  const [newsApi, exa, firecrawl] = await Promise.all([isNewsApiConfigured(), isExaConfigured(), isFirecrawlConfigured()]);
  return newsApi || exa || firecrawl;
}

let intervalHandle = null;

// Mirrors imapPoller.js's start/stop pattern: runs once immediately, then
// on an interval. Deliberately does nothing (not even the initial run) if
// no source is configured — this was previously the entire gap: nothing
// called POST /market-intelligence/run automatically at all.
export async function startMarketIntelligenceScheduler() {
  if (!(await isMarketIntelligenceSchedulerEnabled())) {
    console.log("[market-intelligence-scheduler] no source configured — scheduler not started.");
    return null;
  }
  if (intervalHandle) {
    return intervalHandle;
  }

  const intervalMs = Number(process.env.MARKET_INTELLIGENCE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  const query = process.env.MARKET_INTELLIGENCE_QUERY ?? "private equity funding acquisition";
  const defaultCampaignId = process.env.MARKET_INTELLIGENCE_DEFAULT_CAMPAIGN_ID || undefined;

  const runOnce = () => {
    runIntelligencePipeline({ query, defaultCampaignId })
      .then((summary) => console.log("[market-intelligence-scheduler] run complete:", JSON.stringify(summary)))
      .catch((err) => console.error("[market-intelligence-scheduler] run failed:", err.message));
  };

  runOnce();
  intervalHandle = setInterval(runOnce, intervalMs);
  console.log(`[market-intelligence-scheduler] running every ${intervalMs}ms`);
  return intervalHandle;
}

export function stopMarketIntelligenceScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
