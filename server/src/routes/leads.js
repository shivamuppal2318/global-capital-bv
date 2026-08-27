import { Router } from "express";
import { prisma } from "../db.js";
import { computeLeadPipeline, computePipelineSummary } from "../lib/leadPipeline.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
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

router.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
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
      data: {
        initials: toInitials(name),
        name,
        company: pickField(flatBody, FIELD_ALIASES.company) ?? "—",
        email,
        mobile,
        capitalAsk: pickField(flatBody, FIELD_ALIASES.capitalAsk) ?? "Not specified",
        leadSource: pickField(flatBody, FIELD_ALIASES.leadSource) ?? "API / Webhook",
        territory: pickField(flatBody, FIELD_ALIASES.territory),
        notes: pickField(flatBody, FIELD_ALIASES.notes),
        status: "NEW",
        qualified: false,
        tone: TONES[Math.floor(Math.random() * TONES.length)],
        engagementStage: "Initial outreach",
        rawPayload: req.body ?? {}
      }
    });

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

export default router;
