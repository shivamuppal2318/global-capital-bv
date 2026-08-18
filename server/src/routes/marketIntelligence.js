import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { runIntelligencePipeline } from "../lib/marketIntelligence/pipeline.js";
import { isNewsApiConfigured } from "../lib/marketIntelligence/sources/newsApiSource.js";
import { isExaConfigured } from "../lib/marketIntelligence/sources/exaSource.js";
import { isFirecrawlConfigured } from "../lib/marketIntelligence/sources/firecrawlSource.js";
import { isGoogleNewsConfigured } from "../lib/marketIntelligence/sources/googleNewsRssSource.js";
import { isApolloConfigured } from "../lib/marketIntelligence/sources/apolloSource.js";
import { isAiProcessorConfigured } from "../lib/marketIntelligence/aiProcessor.js";

export const marketIntelligenceRouter = Router();

// No real inbound trigger exists yet (no source has a webhook wired up the
// way the email/Calendly integrations do) — this is a manual/cron-callable
// trigger. Point an actual cron job (or CronCreate-style scheduler) at this
// once it's worth running unattended.
marketIntelligenceRouter.get("/status", (_req, res) => {
  res.json({
    newsApi: isNewsApiConfigured(),
    exa: isExaConfigured(),
    firecrawl: isFirecrawlConfigured(),
    googleNews: isGoogleNewsConfigured(),
    apollo: isApolloConfigured(),
    aiProcessor: isAiProcessorConfigured()
  });
});

const runSchema = z.object({
  query: z.string().optional(),
  firecrawlUrls: z.array(z.string().url()).optional(),
  defaultCampaignId: z.string().optional()
});

marketIntelligenceRouter.post("/run", asyncHandler(async (req, res) => {
  const parsed = runSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const summary = await runIntelligencePipeline(parsed.data);
  res.status(200).json(summary);
}));

marketIntelligenceRouter.get("/signals", asyncHandler(async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {};
  const signals = await prisma.marketSignal.findMany({
    where,
    orderBy: { fetchedAt: "desc" },
    take: 100
  });
  res.json(signals);
}));
