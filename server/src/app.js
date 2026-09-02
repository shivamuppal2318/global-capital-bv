import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import jwt from "jsonwebtoken";
import { requireAuth } from "./middleware/requireAuth.js";
import { requireChannelPartnerAuth } from "./middleware/requireChannelPartnerAuth.js";
import { requireModule } from "./lib/permissions.js";
import { hasChannelPartnerModule } from "./lib/channelPartnerPermissions.js";
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
import { documentsRouter } from "./routes/documents.js";
import { dealStagesRouter } from "./routes/dealStages.js";
import { ageingReportRouter } from "./routes/ageingReport.js";
import { ndaRecordsRouter } from "./routes/ndaRecords.js";
import { visitPlansRouter } from "./routes/visitPlans.js";
import { channelPartnersRouter } from "./routes/channelPartners.js";
import { channelPartnerAgreementRouter } from "./routes/channelPartnerAgreement.js";
import { channelPartnerPortalAuthRouter } from "./routes/channelPartnerPortalAuth.js";
import { ioiRecordsRouter } from "./routes/ioiRecords.js";
import { executiveDashboardRouter } from "./routes/executiveDashboard.js";
import { universalFiltersRouter } from "./routes/universalFilters.js";
import { outreachDoeRouter } from "./routes/outreachDoe.js";
// Email cold-outreach domain (merged from the `crm` branch) — kept as
// separate routers/mount paths from the WhatsApp domain above, matching the
// separate Email*-prefixed Prisma models (see schema.prisma).
import { emailAccountsRouter } from "./routes/emailAccounts.js";
import { trackingRouter } from "./routes/tracking.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { bouncesRouter } from "./routes/bounces.js";
import { unsubscribeRouter } from "./routes/unsubscribe.js";
import { ndaRouter } from "./routes/nda.js";
import { interestedRouter } from "./routes/interested.js";
import { clientPortalRouter } from "./routes/clientPortal.js";
import { calendlyWebhookRouter } from "./routes/calendlyWebhook.js";
import { zoomWebhookRouter } from "./routes/zoomWebhook.js";
import { marketIntelligenceRouter } from "./routes/marketIntelligence.js";
import { emailLeadsRouter } from "./routes/emailLeads.js";
import { emailCampaignsRouter } from "./routes/emailCampaigns.js";
import { emailTemplatesRouter } from "./routes/emailTemplates.js";
import { emailSegmentsRouter } from "./routes/emailSegments.js";
import { emailAiAgentRouter } from "./routes/emailAiAgent.js";

const app = express();

// Needed for the login rate limiters below to key on the real client IP
// instead of a reverse proxy's — safe to set even when there's no proxy in
// front of this process (Express just falls back to the raw socket address).
app.set("trust proxy", 1);

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
const PUBLIC_PREFIXES = [
  "/api/webhooks",
  "/api/unsubscribe",
  "/api/nda",
  "/api/interested",
  "/api/track",
  "/api/client-portal",
  "/api/channel-partner-agreement",
  // The Channel Partner Portal's own login endpoint — unauthenticated by
  // definition (it's what issues the channel-partner token in the first
  // place). /me on the same router carries its own requireChannelPartnerAuth.
  "/api/channel-partner-portal-auth"
];
const INBOUND_WEBHOOK_PATHS = ["/api/leads/inbound", "/api/email/leads/inbound"];
// Matches the prefix itself or the prefix followed by "/" — a plain
// startsWith would also match "/api/nda-records" against "/api/nda" (no
// separator boundary), silently skipping requireAuth for it. That's not
// hypothetical: it's exactly what happened here, and it meant req.user was
// never populated for any /api/nda-records request, which requireModule
// downstream then rejected with a 403 for every user including admins —
// looked like a permissions bug, was actually skipped auth.
function matchesPublicPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}
// Email Automation is the one slice a Channel Partner's own portal reaches
// (see ChannelPartnerPortalApp.jsx, reusing EmailOutreachModule unchanged) —
// everything else in the app stays staff-only. A channel-partner bearer
// token has no req.user a staff-shaped requireAuth could ever recognize, so
// these two prefixes need their own branch rather than falling through to
// the staff check below.
const CHANNEL_PARTNER_ELIGIBLE_PREFIXES = [
  "/api/email/campaigns",
  "/api/email/leads",
  // Optional, per-partner-granted extras (see lib/channelPartnerPermissions.js)
  // -- unlike campaigns/leads above these are refused per-partner below
  // unless actually granted, not unconditional just by reaching this list.
  "/api/email/segments",
  "/api/email/templates",
  "/api/email/ai-agent",
  "/api/market-intelligence",
  "/api/leads"
];
app.use((req, res, next) => {
  if (req.method === "POST" && INBOUND_WEBHOOK_PATHS.includes(req.path)) return next();
  if (PUBLIC_PREFIXES.some((prefix) => matchesPublicPrefix(req.path, prefix))) return next();

  // Peek at the token's own `type` claim (unverified — jwt.decode does no
  // signature check) purely to route to the right check. The actual
  // authentication still happens inside requireChannelPartnerAuth (which
  // does verify the signature); a forged/garbage `type` claim just falls
  // through to the normal staff requireAuth below and fails there, exactly
  // as it always has.
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const decoded = token ? jwt.decode(token) : null;

  if (decoded?.type === "channel-partner") {
    if (CHANNEL_PARTNER_ELIGIBLE_PREFIXES.some((prefix) => matchesPublicPrefix(req.path, prefix))) {
      return requireChannelPartnerAuth(req, res, next);
    }
    // A genuinely authenticated Channel Partner session hitting a
    // staff-only path — this MUST be 403 (wrong tier), never fall through
    // to the staff requireAuth below. requireAuth would 401 it ("Account
    // no longer exists", since a ChannelPartnerUser id isn't in the User
    // table), and apiFetch.js on the frontend treats ANY 401 as "session
    // expired" — clearing the partner's perfectly valid token and bouncing
    // them back to the login screen just because one background prefetch
    // (e.g. useEmailOutreachState's unconditional Templates prefetch) hit
    // an out-of-scope endpoint. 403 leaves the session alone, which is the
    // correct behavior here: the token isn't invalid, it's just the wrong
    // tier for this one route.
    return res.status(403).json({ error: "This area of the app is staff-only." });
  }

  return requireAuth(req, res, next);
});

// Per-module access control. Hiding a nav item in the browser is a
// convenience, not a control — an employee without a module must be
// refused at the API too, which is what requireModule does here. Admins
// pass everything (see lib/permissions.js).
const wa = requireModule("whatsapp-business");

app.use("/api/admin", adminRouter);
app.use("/api/whatsapp/overview", wa, overviewRouter);
app.use("/api/whatsapp/dashboard", wa, dashboardRouter);
app.use("/api/whatsapp/chat", wa, chatRouter);
app.use("/api/whatsapp/templates", wa, templatesRouter);
app.use("/api/whatsapp/campaigns", wa, campaignsRouter);
app.use("/api/whatsapp/drip-campaigns", wa, dripCampaignsRouter);
app.use("/api/whatsapp/auto-replies", wa, autoRepliesRouter);
app.use("/api/whatsapp/bot-flows", wa, botFlowsRouter);
app.use("/api/whatsapp/crm-triggers", wa, crmTriggersRouter);
app.use("/api/whatsapp/automation", wa, automationRouter);
app.use("/api/whatsapp/settings", settingsRouter);
app.use(
  "/api/leads",
  (req, res, next) => {
    // Mirrors the requireAuth bypass above: an external platform's
    // API-key-authenticated POST to /inbound has no req.user (requireAuth
    // never ran for it), so requireModule's permission check must be
    // skipped here too — otherwise every inbound webhook call gets
    // rejected as "no access" before it ever reaches the route's own
    // x-api-key check.
    if (req.method === "POST" && req.path === "/inbound") return next();
    // A Channel Partner reaches only the read-only, per-partner-scoped
    // routes leads.js itself refuses everything else for (see
    // blockChannelPartner there) — this just checks the module grant, the
    // actual scoping/write-refusal lives in the route handlers.
    if (req.channelPartner) {
      if (hasChannelPartnerModule(req.channelPartner, "crm-workspace")) return next();
      return res.status(403).json({ error: "Your account doesn't have access to this. Ask an admin to enable it." });
    }
    return requireModule("crm-workspace", "leads")(req, res, next);
  },
  leadsRouter
);
app.use("/api/documents", requireModule("data-room"), documentsRouter);
// One router serves all seven stages (the stage is a filter, not a route),
// so it unlocks for anyone holding any of the stage modules; the screens
// themselves are still gated individually in the sidebar.
app.use(
  "/api/deal-stages",
  requireModule("nda", "meetings", "data-room", "ioi", "visit-planning", "field-visit", "term-sheet"),
  dealStagesRouter
);
// A cross-cutting report over the same deal-stage data — gated on its own
// module id since it can be granted independently of the stage screens it
// reports on. Per-DOE activity itself lives in outreachDoeRouter below, not
// duplicated here.
app.use("/api/ageing-report", requireModule("ageing-report"), ageingReportRouter);
// NDA tracking and visit planning outgrew the shared deal-stage table, so
// they have dedicated routers. Note this is not "/api/nda" — that path is
// the public token-based signing page and must stay unauthenticated.
app.use("/api/nda-records", requireModule("nda"), ndaRecordsRouter);
app.use("/api/visit-plans", requireModule("visit-planning"), visitPlansRouter);
app.use("/api/channel-partners", requireModule("channel-partner"), channelPartnersRouter);
// Public token-based signing page (same pattern as /api/nda) — not
// "/api/channel-partners" plus a subpath, since that's the authenticated
// admin CRUD router above.
app.use("/api/channel-partner-agreement", channelPartnerAgreementRouter);
// The portal's own login/me — see the PUBLIC_PREFIXES comment above for why
// this path is unauthenticated at the global-gate level.
app.use("/api/channel-partner-portal-auth", channelPartnerPortalAuthRouter);
app.use("/api/ioi-records", requireModule("ioi"), ioiRecordsRouter);
app.use("/api/executive-dashboard", requireModule("command-center"), executiveDashboardRouter);
app.use("/api/universal-filters", requireModule("universal-filters"), universalFiltersRouter);
app.use("/api/ai", aiChatRouter);
app.use("/api/zoom", requireModule("meetings"), zoomRouter);
app.use("/api/meetings", requireModule("meetings"), meetingsRouter);

// Email cold-outreach domain. Everything here already passed the global
// requireAuth gate above except the four public-facing routers at the
// bottom of this block (bounce/Calendly webhooks, unsubscribe, NDA
// signing, tracking) — those are hit directly by external senders/leads,
// never through the logged-in app UI.
const outreach = requireModule("cold-bulk-mailing", "leads");
// A request that already authenticated as a Channel Partner (req.channelPartner
// set by the global gate's branch above) has no req.user/role for
// requireModule's staff-permission check to run against — it's already been
// authenticated at a different, real tier and is always granted exactly this
// one slice, so the staff module gate is skipped for it rather than 403ing.
function outreachOrChannelPartner(req, res, next) {
  if (req.channelPartner) return next();
  return outreach(req, res, next);
}
// Unlike campaigns/leads above (unconditional for any channel-partner
// token, since they share one non-separable API surface), these three are
// genuinely optional per-partner grants -- refused unless
// ChannelPartnerUser.permissions actually includes this module id, not
// just reached via CHANNEL_PARTNER_ELIGIBLE_PREFIXES.
function outreachOrChannelPartnerModule(moduleId) {
  return (req, res, next) => {
    if (req.channelPartner) {
      if (hasChannelPartnerModule(req.channelPartner, moduleId)) return next();
      return res.status(403).json({ error: "Your account doesn't have access to this. Ask an admin to enable it." });
    }
    return requireModule("cold-bulk-mailing")(req, res, next);
  };
}
app.use("/api/outreach-doe", outreach, outreachDoeRouter);
app.use("/api/email/campaigns", outreachOrChannelPartner, emailCampaignsRouter);
app.use(
  "/api/email/leads",
  (req, res, next) => {
    // Same reasoning as the /api/leads/inbound bypass above: this call has
    // no req.user (requireAuth already skipped it), so the module gate must
    // skip it too, or every external POST dies here with a 403 before ever
    // reaching the route's own x-api-key check.
    if (req.method === "POST" && req.path === "/inbound") return next();
    return outreachOrChannelPartner(req, res, next);
  },
  emailLeadsRouter
);
// Templates & Cadences is a tab inside MailX now (see
// EmailOutreachModule.jsx), not its own nav entry, so it shares MailX's
// module id rather than needing one of its own.
app.use("/api/email/templates", outreachOrChannelPartnerModule("templates"), emailTemplatesRouter);
// Segments and AI Agent are tabs inside MailX too — same module id as
// Templates & Cadences above, for the same reason.
app.use("/api/email/segments", outreachOrChannelPartnerModule("segments"), emailSegmentsRouter);
app.use("/api/email/ai-agent", outreachOrChannelPartnerModule("ai-agent"), emailAiAgentRouter);
// Not module-gated: everyone manages their own mailbox from Admin Panel →
// My Account, and the router itself already scopes non-admins to the
// mailboxes they own.
app.use("/api/email-accounts", emailAccountsRouter);
app.use("/api/market-intelligence", outreachOrChannelPartnerModule("market-intelligence"), marketIntelligenceRouter);
app.use("/api/webhooks/bounce", bouncesRouter);
app.use("/api/webhooks/calendly", calendlyWebhookRouter);
app.use("/api/webhooks/zoom", zoomWebhookRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/unsubscribe", unsubscribeRouter);
app.use("/api/nda", ndaRouter);
app.use("/api/interested", interestedRouter);
// Its own auth (a per-lead invite token, then a session cookie) rather
// than the staff JWT gate above — see requireClientAuth.
app.use("/api/client-portal", clientPortalRouter);
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
