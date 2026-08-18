import express from "express";
import cors from "cors";
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

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

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

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
});

export default app;
