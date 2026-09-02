import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { signClientInviteToken } from "../lib/clientPortalToken.js";
import { signStaffPreviewToken } from "../lib/staffPreviewToken.js";
import { hashPassword } from "../lib/auth.js";
import { sendSystemEmail, clientPortalInviteEmail, shell } from "../lib/systemMailer.js";
import { plainTextToHtml } from "../lib/leadSender.js";
import { computeLeadPipeline, computePipelineSummary, computeDealBoard, computeLeadTimeline } from "../lib/leadPipeline.js";
import { leadOwnerWhereClause } from "../lib/channelPartnerLeadScope.js";
import { getZoomInfoCredentials } from "../lib/zoominfoSettings.js";
import { enrichCompanyByName, enrichContactByName, getAccessToken } from "../lib/zoominfoClient.js";

const router = Router();

// A Channel Partner's CRM Workspace access is read-only and scoped to
// their own referred leads (see leadOwnerWhereClause) -- everything that
// writes, and the two company-wide aggregates below that have no filter
// param to scope by, is refused outright rather than silently exposing
// (aggregates) or letting an external partner edit (writes) deal records
// that are really staff/DOE responsibility.
function blockChannelPartner(req, res, next) {
  if (req.channelPartner) {
    return res.status(403).json({ error: "Your account has read-only access to your own referred leads." });
  }
  next();
}

// The client portal is server-rendered by THIS API (see routes/clientPortal.js),
// not the React SPA — so its links point at the API's own base URL, the
// same pattern trackingPixelUrl()/leadSender.js already use, not
// lib/appUrl.js's appBaseUrl() (that one is the frontend's CORS_ORIGIN,
// used for links that open the SPA's sign-in page).
function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

// clientUser select is deliberately never the password hash, which has no
// reason to leave this route at all — status/lastLoginAt/createdAt are
// what the CRM Workspace lead panel's "Client Portal" card shows staff.
const clientUserSelect = { select: { id: true, email: true, status: true, lastLoginAt: true, createdAt: true } };

router.get("/", async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: leadOwnerWhereClause(req),
      orderBy: { createdAt: "desc" },
      include: { clientUser: clientUserSelect }
    });
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
router.get("/pipeline-summary", blockChannelPartner, async (req, res, next) => {
  try {
    res.json(await computePipelineSummary());
  } catch (err) {
    next(err);
  }
});

// Kanban board: one column per stage, one card per lead in its current
// stage. Same "register before /:id" reasoning as pipeline-summary above.
router.get("/deal-board", blockChannelPartner, async (req, res, next) => {
  try {
    res.json(await computeDealBoard());
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    // findFirst (not findUnique) since a Channel Partner's ownership filter
    // isn't a unique-lookup field -- id + channelPartner together aren't
    // findUnique-able, this is a real "does this id match AND is it theirs"
    // query.
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadOwnerWhereClause(req) },
      include: { clientUser: clientUserSelect }
    });
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
    // computeLeadPipeline itself takes just a leadId with no ownership
    // concept -- confirm the lead is actually this Channel Partner's own
    // (or that no partner is involved at all, i.e. staff) before running it.
    const owned = await prisma.lead.findFirst({ where: { id: req.params.id, ...leadOwnerWhereClause(req) }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: "Lead not found" });

    const pipeline = await computeLeadPipeline(req.params.id);
    if (!pipeline) return res.status(404).json({ error: "Lead not found" });
    res.json(pipeline);
  } catch (err) {
    next(err);
  }
});

// A dated, chronological event list for one lead — see lib/leadPipeline.js.
// Deal-progression milestones, read-only, auto-derived from records that
// already exist (NDA/Meeting/DealStageRecord/IOI/VisitPlan/Document) plus
// LeadActivityLog (Send Mail sends, status changes).
router.get("/:id/timeline", async (req, res, next) => {
  try {
    const owned = await prisma.lead.findFirst({ where: { id: req.params.id, ...leadOwnerWhereClause(req) }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: "Lead not found" });

    const timeline = await computeLeadTimeline(req.params.id);
    if (!timeline) return res.status(404).json({ error: "Lead not found" });
    res.json(timeline);
  } catch (err) {
    next(err);
  }
});

// Direct communications with this lead — Send Mail sends and status
// changes — distinct from the Timeline above (deal-progression milestones
// derived from other modules' own records). Sourced only from
// LeadActivityLog.
router.get("/:id/interactions", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const activity = await prisma.leadActivityLog.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } });
    res.json(activity);
  } catch (err) {
    next(err);
  }
});

// A rep writes a free-text subject+body and sends it straight to this
// lead's email — the "Send Mail" quick action. Uses the same transactional
// sendSystemEmail primitive already reused for Zoom meeting invites
// (meetings.js) — Lead has no unsubscribe/bounce/daily-cap machinery like
// EmailLead does, so leadSender.js's sendRawEmail/sendTemplateEmail (built
// specifically for that, with tracking/compliance baked in) would be the
// wrong fit here.
router.post("/:id/send-mail", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (!lead.email) return res.status(400).json({ error: "This lead has no email address on file." });

    const subject = req.body?.subject?.toString().trim();
    const body = req.body?.body?.toString().trim();
    if (!subject || !body) return res.status(400).json({ error: "Subject and body are required." });

    const html = shell(subject, plainTextToHtml(body));
    const delivery = await sendSystemEmail({ to: lead.email, subject, html, text: body });

    if (delivery.sent) {
      await prisma.leadActivityLog.create({
        data: { leadId: lead.id, kind: "EMAIL_SENT", title: subject, detail: body }
      });
    }

    res.json({ sent: delivery.sent, reason: delivery.sent ? undefined : delivery.reason });
  } catch (err) {
    next(err);
  }
});

// Manual, one-click company AND contact enrichment via ZoomInfo —
// deliberately not automatic on lead creation (see Admin Panel → ZoomInfo
// for the credentials), so every real API credit spent is a rep's explicit
// choice. Only fills industry/territory if they're still empty (never
// overwrites a value a rep already set), while the full raw attributes
// always get stored for display — a rep-entered "Fintech" shouldn't be
// silently replaced by ZoomInfo's own industry label, but the company card
// should still show ZoomInfo's data underneath it.
router.post("/:id/enrich", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const credentials = await getZoomInfoCredentials();
    if (!credentials) {
      return res.status(400).json({ error: "ZoomInfo isn't connected — set it up in Admin Panel → ZoomInfo first." });
    }

    // Company and contact are independent ZoomInfo matches — one can
    // succeed while the other doesn't (a real person often isn't in
    // ZoomInfo even when their employer is, and vice versa), so both are
    // attempted and reported separately rather than treating the whole
    // action as all-or-nothing. Both reuse the SAME token: minting two
    // tokens concurrently for one client_id invalidates one of them.
    const token = await getAccessToken(credentials);
    const [companyAttributes, contactAttributes] = await Promise.all([
      enrichCompanyByName({ token, companyName: lead.company }),
      enrichContactByName({ token, fullName: lead.name, companyName: lead.company })
    ]);

    if (!companyAttributes && !contactAttributes) {
      return res.json({ matched: false, message: `No confident ZoomInfo match found for "${lead.name}" at "${lead.company}".` });
    }

    const territoryFromZoomInfo = companyAttributes
      ? [companyAttributes.city, companyAttributes.state, companyAttributes.country].filter(Boolean).join(", ")
      : "";

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        industry: lead.industry || companyAttributes?.primaryIndustry?.[0] || lead.industry,
        territory: lead.territory || territoryFromZoomInfo || lead.territory,
        ...(companyAttributes ? { zoomInfoData: companyAttributes } : {}),
        ...(contactAttributes ? { zoomInfoContactData: contactAttributes } : {}),
        zoomInfoEnrichedAt: new Date()
      }
    });

    res.json({
      matched: true,
      companyMatched: Boolean(companyAttributes),
      contactMatched: Boolean(contactAttributes),
      lead: updated
    });
  } catch (err) {
    next(err);
  }
});

// Text fields that clear to null on an empty string rather than storing "" —
// the Universal Filters screen treats an empty value as "not set", not as a
// distinct value to filter on.
const TEXT_FIELDS = ["owner", "territory", "leadSource", "industry", "channelPartner", "teamLeader", "manager", "doe", "capitalAsk"];

router.patch("/:id", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const data = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.qualified !== undefined) data.qualified = req.body.qualified;
    if (req.body.temperature !== undefined) data.temperature = req.body.temperature || null;
    if (req.body.tags !== undefined) {
      data.tags = Array.isArray(req.body.tags) ? [...new Set(req.body.tags.map((t) => String(t).trim()).filter(Boolean))] : [];
    }
    for (const field of TEXT_FIELDS) {
      if (req.body[field] !== undefined) data[field] = req.body[field]?.toString().trim() || null;
    }
    // capitalAsk is required (non-nullable) — an empty submission leaves it
    // as-is rather than clearing a field the schema doesn't allow to be null.
    if (data.capitalAsk === null) data.capitalAsk = lead.capitalAsk;

    const updated = await prisma.lead.update({ where: { id: lead.id }, data });

    // Logged here (not just on the dedicated Convert quick-action) so any
    // status edit — via Convert or the Overview form's status dropdown —
    // shows up in Interactions/Timeline uniformly, from one place.
    if (data.status !== undefined && data.status !== lead.status) {
      await prisma.leadActivityLog.create({
        data: { leadId: lead.id, kind: "STATUS_CHANGED", title: `Status changed to ${data.status}`, detail: `Previously ${lead.status}` }
      });
    }

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
router.post("/", blockChannelPartner, async (req, res, next) => {
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
router.post("/bulk", blockChannelPartner, async (req, res, next) => {
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

// Shared by the manual "Send Portal Invite" button and the from-email-lead
// conversion route below — same token/email logic either way, just a
// different trigger. Returns a plain result object rather than touching
// `res` directly so both callers can shape their own response.
async function sendPortalInviteForLead(lead) {
  if (lead.clientUser) {
    return { ok: false, status: 400, error: `${lead.company} already has a portal account (${lead.clientUser.email}).` };
  }
  if (!lead.email) {
    return { ok: false, status: 400, error: "This lead has no email address on file — add one before inviting them." };
  }

  const token = signClientInviteToken(lead.id);
  const inviteUrl = `${apiBaseUrl()}/api/client-portal/register/${token}`;

  const { subject, html, text } = clientPortalInviteEmail({ contactName: lead.name, company: lead.company, registerUrl: inviteUrl });
  const result = await sendSystemEmail({ to: lead.email, subject, html, text });

  return { ok: true, inviteUrl, sent: result.sent, reason: result.sent ? undefined : result.reason };
}

// Deliberately triggered per-lead by a rep, not auto-sent to every cold
// contact: the client portal only means something once there's a real
// deal underway to show progress on, and most cold-email recipients never
// reach that point (EmailLead has no link to a CRM Lead at all — see
// businessContext.js's earlier note on the same gap). "Sent" here means
// the invite email actually went out via the configured system SMTP; if
// none is configured, the link is still generated and returned so a rep
// can copy/paste it by hand instead of the whole action failing.
router.post("/:id/portal-invite", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { clientUser: true } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const result = await sendPortalInviteForLead(lead);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    res.json({ inviteUrl: result.inviteUrl, sent: result.sent, reason: result.reason });
  } catch (err) {
    next(err);
  }
});

// Turns a cold-outreach EmailLead into a real CRM Lead and immediately
// fires the portal invite on it — the actual trigger point the team wants
// (see the note above): a cold contact only gets a portal invite once
// they're converted into a tracked deal, not on the first cold email.
router.post("/from-email-lead/:emailLeadId", blockChannelPartner, async (req, res, next) => {
  try {
    const emailLead = await prisma.emailLead.findUnique({ where: { id: req.params.emailLeadId } });
    if (!emailLead) return res.status(404).json({ error: "Email lead not found" });
    if (emailLead.convertedToLeadId) {
      return res.status(400).json({ error: "This contact has already been converted to a CRM lead." });
    }

    const lead = await prisma.lead.create({
      data: buildLeadCreateData({
        name: emailLead.name,
        company: emailLead.company,
        email: emailLead.email,
        owner: emailLead.owner,
        leadSource: "Cold outreach reply"
      })
    });

    await prisma.emailLead.update({
      where: { id: emailLead.id },
      data: { convertedToLeadId: lead.id, convertedAt: new Date() }
    });

    const invite = await sendPortalInviteForLead(lead);

    res.status(201).json({
      lead,
      inviteUrl: invite.ok ? invite.inviteUrl : undefined,
      sent: invite.ok ? invite.sent : false,
      reason: invite.ok ? invite.reason : invite.error
    });
  } catch (err) {
    next(err);
  }
});

// Resets a client's portal password to a new random one, returned once —
// the admin-driven counterpart to the client's own forgot-password flow
// (routes/clientPortal.js), for when they can't receive that email
// themselves. Mirrors POST /api/admin/employees/:id/reset-password.
function generateClientPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

router.post("/:id/client-portal/reset-password", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { clientUser: true } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (!lead.clientUser) return res.status(400).json({ error: "This lead doesn't have a client portal account yet." });

    const temporaryPassword = generateClientPassword();
    await prisma.clientUser.update({
      where: { id: lead.clientUser.id },
      data: { passwordHash: await hashPassword(temporaryPassword) }
    });

    res.json({ email: lead.clientUser.email, temporaryPassword });
  } catch (err) {
    next(err);
  }
});

// A short-lived, read-only link staff can open in a new tab to see exactly
// what this lead's client sees on their own portal dashboard — see
// routes/clientPortal.js's GET /preview/:leadId and lib/staffPreviewToken.js
// for why this needs its own token rather than the normal Bearer session.
router.post("/:id/client-portal/preview-link", blockChannelPartner, async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { clientUser: true } });
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (!lead.clientUser) return res.status(400).json({ error: "This lead doesn't have a client portal account yet." });

    const token = signStaffPreviewToken(lead.id);
    res.json({ previewUrl: `${apiBaseUrl()}/api/client-portal/preview/${lead.id}?token=${token}` });
  } catch (err) {
    next(err);
  }
});

export default router;
