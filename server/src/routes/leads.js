import { Router } from "express";
import { prisma } from "../db.js";
import { signClientInviteToken } from "../lib/clientPortalToken.js";
import { sendSystemEmail, clientPortalInviteEmail } from "../lib/systemMailer.js";
import { computeLeadPipeline, computePipelineSummary, computeDealBoard } from "../lib/leadPipeline.js";

const router = Router();

// The client portal is server-rendered by THIS API (see routes/clientPortal.js),
// not the React SPA — so its links point at the API's own base URL, the
// same pattern trackingPixelUrl()/leadSender.js already use, not
// lib/appUrl.js's appBaseUrl() (that one is the frontend's CORS_ORIGIN,
// used for links that open the SPA's sign-in page).
function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

// clientUser select is deliberately id/email only — never the password
// hash, which has no reason to leave this route at all.
const clientUserSelect = { select: { id: true, email: true } };

router.get("/", async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" }, include: { clientUser: clientUserSelect } });
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// How many of ALL leads have reached each stage — CRM Workspace's own
// company-wide summary, distinct from Executive Dashboard's fuller Funnel
// Health chart (which also shows conversion rates between stages). Must be
// registered before "/:id" below, or Express would match "pipeline-summary"
// itself as an :id.
router.get("/pipeline-summary", async (req, res, next) => {
  try {
    res.json(await computePipelineSummary());
  } catch (err) {
    next(err);
  }
});

// Kanban board: one column per stage, one card per lead in its current
// stage. Same "register before /:id" reasoning as pipeline-summary above.
router.get("/deal-board", async (req, res, next) => {
  try {
    res.json(await computeDealBoard());
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { clientUser: clientUserSelect } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// This one lead's real progress across the full deal lifecycle — see
// lib/leadPipeline.js. A per-record complement to Executive Dashboard's
// company-wide Funnel Health chart, not the same thing: that one counts
// leads per stage across the whole pipeline, this shows where ONE lead
// stands right now.
router.get("/:id/pipeline", async (req, res, next) => {
  try {
    const pipeline = await computeLeadPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "Lead not found" });
    res.json(pipeline);
  } catch (err) {
    next(err);
  }
});

// Text fields that clear to null on an empty string rather than storing "" —
// the Universal Filters screen treats an empty value as "not set", not as a
// distinct value to filter on.
const TEXT_FIELDS = ["owner", "territory", "leadSource", "industry", "channelPartner", "teamLeader", "manager", "doe", "capitalAsk"];

router.patch("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const data = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.qualified !== undefined) data.qualified = req.body.qualified;
    if (req.body.temperature !== undefined) data.temperature = req.body.temperature || null;
    for (const field of TEXT_FIELDS) {
      if (req.body[field] !== undefined) data[field] = req.body[field]?.toString().trim() || null;
    }
    // capitalAsk is required (non-nullable) — an empty submission leaves it
    // as-is rather than clearing a field the schema doesn't allow to be null.
    if (data.capitalAsk === null) data.capitalAsk = lead.capitalAsk;

    const updated = await prisma.lead.update({ where: { id: lead.id }, data });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// --- Inbound webhook / API for external platforms ---------------------------

const FIELD_ALIASES = {
  name: ["name", "full_name", "fullname", "lead_name", "leadname", "contact_name", "contactname"],
  email: ["email", "email_address", "emailaddress", "contact_email"],
  mobile: ["mobile", "phone", "phone_number", "phonenumber", "contact_phone", "whatsapp"],
  company: ["company", "company_name", "companyname", "organization", "org", "business_name"],
  capitalAsk: ["capital_ask", "capitalask", "deal_size", "dealsize", "amount", "value", "budget"],
  leadSource: ["source", "lead_source", "leadsource", "utm_source", "channel", "platform"],
  territory: ["territory", "region", "location", "country"],
  notes: ["notes", "message", "comments", "description", "enquiry"]
};

function pickField(flatBody, aliases) {
  for (const alias of aliases) {
    if (flatBody[alias] !== undefined && flatBody[alias] !== null && flatBody[alias] !== "") {
      return String(flatBody[alias]).trim();
    }
  }
  return null;
}

function toInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TONES = ["blue", "amber", "green", "violet", "sky"];

// Shared by every path that creates a Lead (the external webhook below, and
// the authenticated create/bulk-import routes) so the same defaults
// (status, tone, engagementStage, initials) can never drift apart between
// them.
function buildLeadCreateData({ name, company, email, mobile, capitalAsk, owner, leadSource, territory, notes, rawPayload }) {
  return {
    initials: toInitials(name),
    name,
    company: company || "—",
    email: email || null,
    mobile: mobile || null,
    capitalAsk: capitalAsk || "Not specified",
    owner: owner || null,
    leadSource: leadSource || "Manual entry",
    territory: territory || null,
    notes: notes || null,
    status: "NEW",
    qualified: false,
    tone: TONES[Math.floor(Math.random() * TONES.length)],
    engagementStage: "Initial outreach",
    rawPayload: rawPayload ?? {}
  };
}

// Any external platform (a website form, ad platform, Zapier, another CRM, a
// custom script) POSTs here with an API key to create a lead directly.
// Field names are matched loosely (see FIELD_ALIASES) since every platform
// names things differently — the full original payload is kept in
// rawPayload for anything that doesn't map cleanly.
router.post("/inbound", async (req, res, next) => {
  try {
    const providedKey = req.get("x-api-key") ?? req.get("authorization")?.replace(/^Bearer\s+/i, "");
    const account = await prisma.businessSettings.findFirst();
    if (!account?.leadWebhookApiKey || providedKey !== account.leadWebhookApiKey) {
      return res.status(401).json({ error: "Missing or invalid API key. Send it as x-api-key or an Authorization: Bearer header." });
    }

    const flatBody = Object.fromEntries(Object.entries(req.body ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

    const name = pickField(flatBody, FIELD_ALIASES.name);
    const email = pickField(flatBody, FIELD_ALIASES.email);
    const mobile = pickField(flatBody, FIELD_ALIASES.mobile);

    if (!name) return res.status(400).json({ error: "A name field is required (name, full_name, lead_name, ...)." });
    if (!email && !mobile) return res.status(400).json({ error: "At least one contact method is required (email or mobile/phone)." });

    const lead = await prisma.lead.create({
      data: buildLeadCreateData({
        name,
        email,
        mobile,
        company: pickField(flatBody, FIELD_ALIASES.company),
        capitalAsk: pickField(flatBody, FIELD_ALIASES.capitalAsk),
        leadSource: pickField(flatBody, FIELD_ALIASES.leadSource) ?? "API / Webhook",
        territory: pickField(flatBody, FIELD_ALIASES.territory),
        notes: pickField(flatBody, FIELD_ALIASES.notes),
        rawPayload: req.body ?? {}
      })
    });

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

// The CRM Workspace screen's own "New record" button — a logged-in rep
// creating a lead directly, as opposed to /inbound above (an external
// platform, gated by its own webhook API key instead of a session).
router.post("/", async (req, res, next) => {
  try {
    const { name, company, email, mobile, capitalAsk, owner, leadSource, territory, notes } = req.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) return res.status(400).json({ error: "Name is required." });
    if (!email && !mobile) return res.status(400).json({ error: "At least one contact method is required (email or mobile)." });

    const lead = await prisma.lead.create({
      data: buildLeadCreateData({ name: trimmedName, company, email, mobile, capitalAsk, owner, leadSource, territory, notes })
    });

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

// CSV import — "Import" button on the same screen. One bad row shouldn't
// abort the whole batch (same "isolate each item" principle as the email
// cold-outreach bulk-create route), so failures are collected and reported
// rather than thrown.
router.post("/bulk", async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ error: "No rows provided." });

    let createdCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const row of rows) {
      const name = typeof row?.name === "string" ? row.name.trim() : "";
      const email = typeof row?.email === "string" ? row.email.trim() : "";
      const mobile = typeof row?.mobile === "string" ? row.mobile.trim() : "";

      if (!name || (!email && !mobile)) {
        failedCount += 1;
        errors.push(`Row missing a name or a contact method (email/mobile): ${JSON.stringify(row)}`);
        continue;
      }

      try {
        await prisma.lead.create({
          data: buildLeadCreateData({
            name,
            email: email || null,
            mobile: mobile || null,
            company: row.company,
            capitalAsk: row.capitalAsk,
            owner: row.owner,
            leadSource: row.leadSource || "CSV import",
            territory: row.territory
          })
        });
        createdCount += 1;
      } catch (err) {
        failedCount += 1;
        errors.push(`Row for "${name}" failed: ${err.message}`);
      }
    }

    res.status(201).json({ createdCount, failedCount, errors });
  } catch (err) {
    next(err);
  }
});

// Deliberately triggered per-lead by a rep, not auto-sent to every cold
// contact: the client portal only means something once there's a real
// deal underway to show progress on, and most cold-email recipients never
// reach that point (EmailLead has no link to a CRM Lead at all — see
// businessContext.js's earlier note on the same gap). "Sent" here means
// the invite email actually went out via the configured system SMTP; if
// none is configured, the link is still generated and returned so a rep
// can copy/paste it by hand instead of the whole action failing.
router.post("/:id/portal-invite", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { clientUser: true } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.clientUser) {
      return res.status(400).json({ error: `${lead.company} already has a portal account (${lead.clientUser.email}).` });
    }
    if (!lead.email) {
      return res.status(400).json({ error: "This lead has no email address on file — add one before inviting them." });
    }

    const token = signClientInviteToken(lead.id);
    const inviteUrl = `${apiBaseUrl()}/api/client-portal/register/${token}`;

    const { subject, html, text } = clientPortalInviteEmail({ contactName: lead.name, company: lead.company, registerUrl: inviteUrl });
    const result = await sendSystemEmail({ to: lead.email, subject, html, text });

    res.json({ inviteUrl, sent: result.sent, reason: result.sent ? undefined : result.reason });
  } catch (err) {
    next(err);
  }
});

export default router;
