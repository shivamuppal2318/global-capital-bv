import { runIntelligencePipeline } from "./pipeline.js";
import { isNewsApiConfigured } from "./sources/newsApiSource.js";
import { isExaConfigured } from "./sources/exaSource.js";
import { isFirecrawlConfigured } from "./sources/firecrawlSource.js";

// News/deal signals don't need minute-level freshness the way an inbound
// email reply does — 6 hours is a reasonable default poll cadence, tune
// via MARKET_INTELLIGENCE_INTERVAL_MS.
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isMarketIntelligenceSchedulerEnabled() {
  return isNewsApiConfigured() || isExaConfigured() || isFirecrawlConfigured();
}

let intervalHandle = null;

// Mirrors imapPoller.js's start/stop pattern: runs once immediately, then
// on an interval. Deliberately does nothing (not even the initial run) if
// no source is configured — this was previously the entire gap: nothing
// called POST /market-intelligence/run automatically at all.
export function startMarketIntelligenceScheduler() {
  if (!isMarketIntelligenceSchedulerEnabled()) {
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
