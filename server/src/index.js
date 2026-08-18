import "dotenv/config";
import express from "express";
import cors from "cors";
import { campaignsRouter } from "./routes/campaigns.js";
import { leadsRouter } from "./routes/leads.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { templatesRouter } from "./routes/templates.js";
import { unsubscribeRouter } from "./routes/unsubscribe.js";
import { bouncesRouter } from "./routes/bounces.js";
import { ndaRouter } from "./routes/nda.js";
import { calendlyWebhookRouter } from "./routes/calendlyWebhook.js";
import { emailAccountsRouter } from "./routes/emailAccounts.js";
import { marketIntelligenceRouter } from "./routes/marketIntelligence.js";
import { trackingRouter } from "./routes/tracking.js";
import { requireApiKey } from "./middleware/apiKey.js";
import { startCadenceWorker, isQueueEnabled } from "./queue/cadenceQueue.js";
import { startImapPoller, isImapPollerEnabled } from "./lib/imapPoller.js";
import { startMarketIntelligenceScheduler, isMarketIntelligenceSchedulerEnabled } from "./lib/marketIntelligence/scheduler.js";

const app = express();
app.use(cors());
// `verify` stashes the exact raw bytes on req.rawBody before JSON-parsing —
// needed by the Calendly webhook's signature check, which has to hash the
// literal request body, not a re-serialized (potentially non-byte-identical)
// JSON.stringify(JSON.parse(body)) of it.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
// Needed for the NDA-signing page's plain HTML <form> POST (see routes/nda.js)
// — everything else in this API speaks JSON.
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    queueEnabled: isQueueEnabled(),
    imapPollerEnabled: isImapPollerEnabled(),
    marketIntelligenceSchedulerEnabled: isMarketIntelligenceSchedulerEnabled()
  });
});

// Webhooks and the unsubscribe link are hit by external systems (email
// provider, a lead's mail client) that can't hold the internal API key —
// they're gated by their own secret/token schemes instead (see the routers
// themselves). Everything else requires the shared API key.
app.use("/campaigns", requireApiKey, campaignsRouter);
app.use("/leads", requireApiKey, leadsRouter);
app.use("/templates", requireApiKey, templatesRouter);
app.use("/email-accounts", requireApiKey, emailAccountsRouter);
app.use("/market-intelligence", requireApiKey, marketIntelligenceRouter);
app.use("/webhooks", webhooksRouter);
app.use("/webhooks/bounce", bouncesRouter);
app.use("/webhooks/calendly", calendlyWebhookRouter);
app.use("/unsubscribe", unsubscribeRouter);
app.use("/nda", ndaRouter);
// Hit directly by a recipient's mail client (pixel) or browser (link
// click), neither of which can carry the internal API key — protected by
// the per-message signed token instead (see lib/trackingToken.js).
app.use("/track", trackingRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT ?? 8787;
app.listen(port, () => {
  console.log(`[server] listening on :${port}`);
  startCadenceWorker();
  startImapPoller();
  startMarketIntelligenceScheduler();
});
