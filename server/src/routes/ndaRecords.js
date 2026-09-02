import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ndaMetrics } from "../lib/relationshipMetrics.js";
import { signClientInviteToken } from "../lib/clientPortalToken.js";
import { sendSystemEmail, ndaReadyToSignEmail } from "../lib/systemMailer.js";
import { relatedLeadOwnerWhereClause } from "../lib/channelPartnerLeadScope.js";
import { renderSignedNda, slugify } from "../lib/signedDocumentRenderer.js";

export const ndaRecordsRouter = Router();

// A Channel Partner's NDA access is read-only, scoped to NDAs on their own
// referred leads only -- company-wide metrics and every write stay refused.
function blockChannelPartner(req, res, next) {
  if (req.channelPartner) {
    return res.status(403).json({ error: "Your account has read-only access to NDAs on your own referred leads." });
  }
  next();
}

// Same reasoning as leads.js's apiBaseUrl(): the client portal is
// server-rendered by THIS API, not the React SPA, so its links point at
// the API's own base URL, not the frontend's CORS_ORIGIN.
function apiBaseUrl() {
  return process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
}

const NDA_STATUSES = ["DRAFT", "SENT", "REMINDER_1", "REMINDER_2", "SIGNED", "DECLINED", "EXPIRED"];

const include = {
  lead: { select: { id: true, name: true, company: true, email: true } },
  // leadId distinguishes a client's own uploaded signed copy (leadId set)
  // from the company-wide template still attached by default (leadId
  // null) -- the frontend uses it to pick which download path to use.
  document: { select: { id: true, originalName: true, leadId: true } }
};

ndaRecordsRouter.get("/", asyncHandler(async (req, res) => {
  const { status, q, leadId, owner } = req.query;
  const records = await prisma.ndaRecord.findMany({
    where: {
      ...relatedLeadOwnerWhereClause(req),
      ...(status && status !== "All" ? { status: String(status) } : {}),
      ...(leadId ? { leadId: String(leadId) } : {}),
      ...(owner ? { owner: { contains: String(owner), mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { lead: { name: { contains: String(q), mode: "insensitive" } } },
              { lead: { company: { contains: String(q), mode: "insensitive" } } },
              { signerName: { contains: String(q), mode: "insensitive" } }
            ]
          }
        : {})
    },
    include,
    orderBy: { updatedAt: "desc" }
  });
  res.json(records);
}));

// A client who accepted via "fill in your details online" never uploaded
// a real file -- documentId still points at the blank company-wide
// template, so there's nothing meaningful for the frontend to just
// download. This renders the template's own text with the client's
// submitted values filled in instead. A record with a genuine client
// upload (document.leadId set) skips this route entirely -- the frontend
// downloads that file directly, same as before.
ndaRecordsRouter.get("/:id/signed-document", asyncHandler(async (req, res) => {
  const nda = await prisma.ndaRecord.findFirst({
    where: { id: req.params.id, ...relatedLeadOwnerWhereClause(req) },
    include: { lead: { select: { company: true } } }
  });
  if (!nda) return res.status(404).json({ error: "NDA record not found" });
  if (nda.status !== "SIGNED") return res.status(400).json({ error: "This NDA hasn't been signed yet." });

  const html = await renderSignedNda(nda);
  const filename = `Signed-NDA-${slugify(nda.counterpartyLegalName || nda.lead?.company || "record")}.html`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(html);
}));

// Metrics come from every record, never the filtered view — a KPI that
// changed when you typed in the search box would be misleading.
ndaRecordsRouter.get("/metrics", blockChannelPartner, asyncHandler(async (_req, res) => {
  const all = await prisma.ndaRecord.findMany({ include: { lead: { select: { name: true, company: true } } } });
  const metrics = ndaMetrics(all);
  // Re-attach lead names to the chase list, which the pure metric function
  // only knows by id.
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  metrics.overdue = metrics.overdue.slice(0, 10).map((o) => ({
    ...o,
    lead: byId[o.id]?.lead ? `${byId[o.id].lead.name} (${byId[o.id].lead.company})` : null
  }));
  res.json(metrics);
}));

const upsertSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(NDA_STATUSES).optional(),
  sentAt: z.string().nullable().optional(),
  reminder1At: z.string().nullable().optional(),
  reminder2At: z.string().nullable().optional(),
  signedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  signerName: z.string().nullable().optional(),
  signerEmail: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documentId: z.string().nullable().optional()
});

const toDate = (v) => (v ? new Date(v) : null);
const toText = (v) => (v && String(v).trim() ? String(v).trim() : null);

function buildData(input) {
  const data = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (["sentAt", "reminder1At", "reminder2At", "signedAt", "expiresAt"].includes(k)) data[k] = toDate(v);
    else if (k === "documentId") data[k] = v || null;
    else if (k === "status") data[k] = v;
    else data[k] = toText(v);
  }
  return data;
}

// One NDA per lead (leadId is unique), so this upserts — recording the same
// lead's NDA twice updates it rather than failing on the constraint.
ndaRecordsRouter.post("/", blockChannelPartner, asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const data = buildData(rest);
  const record = await prisma.ndaRecord.upsert({
    where: { leadId },
    create: { leadId, ...data },
    update: data,
    include
  });
  res.status(201).json(record);
}));

// Advancing the status flow (Sent -> Reminder 1 -> Reminder 2 -> Signed) as
// a single action, so the UI doesn't have to know which timestamp field
// each step writes — and so the timestamp can never be forgotten.
const ACTION_FIELD = {
  send: { field: "sentAt", status: "SENT" },
  remind1: { field: "reminder1At", status: "REMINDER_1" },
  remind2: { field: "reminder2At", status: "REMINDER_2" },
  sign: { field: "signedAt", status: "SIGNED" }
};

ndaRecordsRouter.post("/:id/:action", blockChannelPartner, asyncHandler(async (req, res) => {
  const step = ACTION_FIELD[req.params.action];
  if (!step) return res.status(400).json({ error: `Unknown action "${req.params.action}".` });

  const existing = await prisma.ndaRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "NDA record not found" });

  // Reminders only make sense once it's actually been sent; without this an
  // NDA could show "reminded" with no send date, which then breaks the
  // signing-time and effectiveness maths.
  if (["remind1", "remind2"].includes(req.params.action) && !existing.sentAt) {
    return res.status(400).json({ error: "Record the send date before logging a reminder." });
  }

  // Sending (or re-sending) after the client has already acted on it would
  // silently regress a SIGNED/DECLINED/EXPIRED record back to "Sent" — the
  // status flow's forward-only buttons make that easy to click by accident.
  if (req.params.action === "send" && ["SIGNED", "DECLINED", "EXPIRED"].includes(existing.status)) {
    return res.status(400).json({ error: `This NDA is already ${existing.status.toLowerCase()} — sending again would incorrectly reset it.` });
  }

  const record = await prisma.ndaRecord.update({
    where: { id: existing.id },
    data: { [step.field]: new Date(), status: step.status },
    include
  });

  // "Send" is the one action a client actually needs to hear about — it's
  // what puts the ball in their court. Reminders/signing stay internal
  // record-keeping (a reminder nudge is a real conversation, not an
  // automated email; signing is either the client's own portal action or a
  // rep recording something that happened offline).
  let emailResult = null;
  if (req.params.action === "send") {
    const lead = await prisma.lead.findUnique({ where: { id: existing.leadId }, include: { clientUser: true } });
    const portalUrl = lead.clientUser
      ? `${apiBaseUrl()}/api/client-portal/login`
      : `${apiBaseUrl()}/api/client-portal/register/${signClientInviteToken(lead.id)}`;

    if (!lead.email) {
      emailResult = { emailed: false, reason: "This lead has no email address on file.", portalUrl: null };
    } else {
      const { subject, html, text } = ndaReadyToSignEmail({
        contactName: lead.name,
        company: lead.company,
        doeName: record.owner,
        portalUrl,
        isNewAccount: !lead.clientUser
      });
      const result = await sendSystemEmail({ to: lead.email, subject, html, text });
      emailResult = { emailed: result.sent, reason: result.sent ? undefined : result.reason, portalUrl };
    }
  }

  res.json({ ...record, emailResult });
}));

ndaRecordsRouter.patch("/:id", blockChannelPartner, asyncHandler(async (req, res) => {
  const parsed = upsertSchema.partial({ leadId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const record = await prisma.ndaRecord
    .update({ where: { id: req.params.id }, data: buildData(rest), include })
    .catch(() => null);
  if (!record) return res.status(404).json({ error: "NDA record not found" });
  res.json(record);
}));

ndaRecordsRouter.delete("/:id", blockChannelPartner, asyncHandler(async (req, res) => {
  const deleted = await prisma.ndaRecord.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "NDA record not found" });
  res.status(204).end();
}));
