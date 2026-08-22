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
import { askChatAssistant, isChatAssistantConfigured } from "../lib/marketIntelligence/chatAssistant.js";

export const marketIntelligenceRouter = Router();

// No real inbound trigger exists yet (no source has a webhook wired up the
// way the email/Calendly integrations do) — this is a manual/cron-callable
// trigger. Point an actual cron job (or CronCreate-style scheduler) at this
// once it's worth running unattended.
marketIntelligenceRouter.get("/status", asyncHandler(async (_req, res) => {
  // All the *Configured() checks below are async now that a data-source key
  // can come from the database rather than only the environment (see
  // lib/marketIntelligenceSettings.js / lib/aiSettings.js).
  const [newsApi, exa, firecrawl, apollo, aiProcessor] = await Promise.all([
    isNewsApiConfigured(),
    isExaConfigured(),
    isFirecrawlConfigured(),
    isApolloConfigured(),
    isAiProcessorConfigured()
  ]);
  res.json({ newsApi, exa, firecrawl, googleNews: isGoogleNewsConfigured(), apollo, aiProcessor });
}));

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

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

const chatSchema = z.object({
  message: z.string().min(1),
  // Prior turns in the conversation, oldest first — the frontend keeps and
  // resends the full transcript since nothing is persisted server-side.
  history: z.array(chatMessageSchema).max(20).optional()
});

// Grounded in whatever's actually in the MarketSignal table (see
// chatAssistant.js's system prompt) — same Claude credentials as the AI
// processing stage, not a separate one. Checked up front (rather
// than letting askChatAssistant's own throw fall through to the generic
// 500 handler in index.js) so the frontend gets a clear, actionable 503
// instead of an opaque "Internal server error".
marketIntelligenceRouter.post("/chat", asyncHandler(async (req, res) => {
  if (!(await isChatAssistantConfigured())) {
    return res.status(503).json({ error: "AI processing is not configured — add a Claude API key under Admin Panel → AI Assistant." });
  }

  const parsed = chatSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // PROCESSED/IGNORED are the only statuses carrying real AI-extracted
  // fields (entityName/signalType/relevanceScore/aiSummary) — PENDING/
  // FAILED/DUPLICATE rows would otherwise crowd out real context with
  // near-empty entries once a backlog of unprocessed signals exists.
  const signals = await prisma.marketSignal.findMany({
    where: { status: { in: ["PROCESSED", "IGNORED"] } },
    orderBy: { fetchedAt: "desc" },
    take: 40
  });

  try {
    const reply = await askChatAssistant(parsed.data.message, {
      signals,
      history: (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content }))
    });
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: `AI assistant request failed: ${err.message}` });
  }
}));
