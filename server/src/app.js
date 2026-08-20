import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import { requireAuth } from "./middleware/requireAuth.js";
import overviewRouter from "./routes/overview.js";
import dashboardRouter from "./routes/dashboard.js";
import chatRouter from "./routes/chat.js";
import templatesRouter from "./routes/templates.js";
import campaignsRouter from "./routes/campaigns.js";
import dripCampaignsRouter from "./routes/dripCampaigns.js";
import autoRepliesRouter from "./routes/autoReplies.js";
import botFlowsRouter from "./routes/botFlows.js";
import crmTriggersRouter from "./routes/crmTriggers.js";
import automationRouter from "./routes/automation.js";
import settingsRouter from "./routes/settings.js";
import leadsRouter from "./routes/leads.js";
import aiChatRouter from "./routes/aiChat.js";
import zoomRouter from "./routes/zoom.js";
import meetingsRouter from "./routes/meetings.js";
// Email cold-outreach domain (merged from the `crm` branch) — kept as
// separate routers/mount paths from the WhatsApp domain above, matching the
// separate Email*-prefixed Prisma models (see schema.prisma).
import { emailAccountsRouter } from "./routes/emailAccounts.js";
import { trackingRouter } from "./routes/tracking.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { bouncesRouter } from "./routes/bounces.js";
import { unsubscribeRouter } from "./routes/unsubscribe.js";
import { ndaRouter } from "./routes/nda.js";
import { calendlyWebhookRouter } from "./routes/calendlyWebhook.js";
import { marketIntelligenceRouter } from "./routes/marketIntelligence.js";
import { emailLeadsRouter } from "./routes/emailLeads.js";
import { emailCampaignsRouter } from "./routes/emailCampaigns.js";
import { emailTemplatesRouter } from "./routes/emailTemplates.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
// `verify` stashes the exact raw bytes on req.rawBody before JSON-parsing —
// needed by the Calendly webhook's signature check, which has to hash the
// literal request body. `urlencoded` is needed by the NDA-signing page's
// plain HTML <form> POST. Both are additive/safe for the existing WhatsApp
// routes (urlencoded only fires on a matching Content-Type; verify just
// stashes bytes).
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);

// Everything below this line requires a logged-in user, except the handful
// of endpoints external systems/people hit directly (not through the app
// UI): the lead-ingestion webhook (its own x-api-key check), and the
// email cold-outreach domain's public-facing links (unsubscribe, NDA
// signing, tracking pixels/redirects, and inbound webhooks from bounce/
// Calendly/other external senders). Matches the app.js comment this
// replaces — auth was deliberately deferred until it could be done as one
// real pass instead of piecemeal.
const PUBLIC_PREFIXES = ["/api/webhooks", "/api/unsubscribe", "/api/nda", "/api/track"];
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/leads/inbound") return next();
  if (PUBLIC_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
  return requireAuth(req, res, next);
});

app.use("/api/admin", adminRouter);
app.use("/api/whatsapp/overview", overviewRouter);
app.use("/api/whatsapp/dashboard", dashboardRouter);
app.use("/api/whatsapp/chat", chatRouter);
app.use("/api/whatsapp/templates", templatesRouter);
app.use("/api/whatsapp/campaigns", campaignsRouter);
app.use("/api/whatsapp/drip-campaigns", dripCampaignsRouter);
app.use("/api/whatsapp/auto-replies", autoRepliesRouter);
app.use("/api/whatsapp/bot-flows", botFlowsRouter);
app.use("/api/whatsapp/crm-triggers", crmTriggersRouter);
app.use("/api/whatsapp/automation", automationRouter);
app.use("/api/whatsapp/settings", settingsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/ai", aiChatRouter);
app.use("/api/zoom", zoomRouter);
app.use("/api/meetings", meetingsRouter);

// Email cold-outreach domain. Everything here already passed the global
// requireAuth gate above except the four public-facing routers at the
// bottom of this block (bounce/Calendly webhooks, unsubscribe, NDA
// signing, tracking) — those are hit directly by external senders/leads,
// never through the logged-in app UI.
app.use("/api/email/campaigns", emailCampaignsRouter);
app.use("/api/email/leads", emailLeadsRouter);
app.use("/api/email/templates", emailTemplatesRouter);
app.use("/api/email-accounts", emailAccountsRouter);
app.use("/api/market-intelligence", marketIntelligenceRouter);
app.use("/api/webhooks/bounce", bouncesRouter);
app.use("/api/webhooks/calendly", calendlyWebhookRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/unsubscribe", unsubscribeRouter);
app.use("/api/nda", ndaRouter);
app.use("/api/track", trackingRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
});

export default app;
