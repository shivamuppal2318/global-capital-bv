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
import { getZoomInfoCredentials } from "../lib/zoominfoSettings.js";
import { getAccessToken } from "../lib/zoominfoClient.js";
import { lookupCompanyInZoomInfo, hasAnyZoomInfoMatch } from "../lib/zoominfoEnrichment.js";

export const marketIntelligenceRouter = Router();

// ZoomInfo enrichment spends real API credits — staff-only, same reasoning
// as leads.js's POST /:id/enrich.
function blockChannelPartner(req, res, next) {
  if (req.channelPartner) {
    return res.status(403).json({ error: "Your account has read-only access to captured signals." });
  }
  next();
}

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
  res.json({
    newsApi,
    exa,
    firecrawl,
    googleNews: isGoogleNewsConfigured(),
    apollo,
    aiProcessor,
    zoomInfo: Boolean(await getZoomInfoCredentials())
  });
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
  // The screen hides FAILED rows from the main feed, so the default API
  // response should not spend its 100-row window on a recent failed batch
  // and leave the visible list empty while older usable signals exist.
  const where = req.query.status ? { status: String(req.query.status) } : { status: { in: ["PROCESSED", "IGNORED", "PENDING"] } };
  const signals = await prisma.marketSignal.findMany({
    where,
    orderBy: { fetchedAt: "desc" },
    take: 100
  });
  res.json(signals);
}));

// Real ZoomInfo company profile + recent buying-trigger activity for one
// captured signal, looked up by its entityName directly — independent of
// whether it ever matched/created an EmailLead (plenty of real signals,
// e.g. IGNORED with no default campaign to route into, never get one).
// Mirrors leads.js's POST /:id/enrich: check credentials configured, mint
// one token, look up, persist on a match.
marketIntelligenceRouter.post("/signals/:id/enrich", blockChannelPartner, asyncHandler(async (req, res) => {
  const signal = await prisma.marketSignal.findUnique({ where: { id: req.params.id } });
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  if (!signal.entityName) {
    return res.status(400).json({ error: "This signal hasn't been identified yet — there's no company name to look up in ZoomInfo." });
  }

  const credentials = await getZoomInfoCredentials();
  if (!credentials) {
    return res.status(400).json({ error: "ZoomInfo isn't connected — set it up in Admin Panel → ZoomInfo first." });
  }

  const token = await getAccessToken(credentials);
  const result = await lookupCompanyInZoomInfo({ token, companyName: signal.entityName });

  if (!hasAnyZoomInfoMatch({ ...result, contactAttributes: undefined })) {
    return res.json({ matched: false, message: `No confident ZoomInfo match found for "${signal.entityName}".` });
  }

  const updated = await prisma.marketSignal.update({
    where: { id: signal.id },
    data: {
      ...(result.companyAttributes ? { zoomInfoCompanyData: result.companyAttributes } : {}),
      ...(result.scoops.length ? { zoomInfoScoops: result.scoops } : {}),
      zoomInfoEnrichedAt: new Date()
    }
  });

  res.json({
    matched: true,
    companyMatched: Boolean(result.companyAttributes),
    scoopsMatched: result.scoops.length > 0,
    signal: updated
  });
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
