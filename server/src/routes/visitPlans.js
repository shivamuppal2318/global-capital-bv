import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { visitMetrics } from "../lib/relationshipMetrics.js";

export const visitPlansRouter = Router();

const STATUSES = ["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"];

const include = {
  lead: { select: { id: true, name: true, company: true } },
  report: { select: { id: true, originalName: true } }
};

visitPlansRouter.get("/", asyncHandler(async (req, res) => {
  const { status, region, q, leadId, owner } = req.query;
  const plans = await prisma.visitPlan.findMany({
    where: {
      ...(status && status !== "All" ? { status: String(status) } : {}),
      ...(region && region !== "All" ? { region: String(region) } : {}),
      ...(leadId ? { leadId: String(leadId) } : {}),
      ...(owner ? { owner: { contains: String(owner), mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { lead: { name: { contains: String(q), mode: "insensitive" } } },
              { lead: { company: { contains: String(q), mode: "insensitive" } } },
              { location: { contains: String(q), mode: "insensitive" } },
              { purpose: { contains: String(q), mode: "insensitive" } }
            ]
          }
        : {})
    },
    include,
    orderBy: [{ plannedFor: "asc" }, { createdAt: "desc" }]
  });
  res.json(plans);
}));

visitPlansRouter.get("/metrics", asyncHandler(async (_req, res) => {
  res.json(visitMetrics(await prisma.visitPlan.findMany()));
}));

// Visits grouped by month then day, for the calendar view. Done server-side
// so the calendar doesn't have to pull every visit and bucket them itself.
visitPlansRouter.get("/calendar", asyncHandler(async (req, res) => {
  const plans = await prisma.visitPlan.findMany({
    where: { plannedFor: { not: null }, status: { not: "CANCELLED" } },
    include,
    orderBy: { plannedFor: "asc" }
  });

  const byDate = {};
  for (const p of plans) {
    const key = p.plannedFor.toISOString().slice(0, 10);
    (byDate[key] ??= []).push({
      id: p.id,
      lead: p.lead ? `${p.lead.name} (${p.lead.company})` : null,
      location: p.location,
      region: p.region,
      status: p.status,
      owner: p.owner
    });
  }
  res.json(byDate);
}));

const upsertSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(STATUSES).optional(),
  plannedFor: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  attendees: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  travelMode: z.string().nullable().optional(),
  // Sent as a string by the form; coerced so "450" and 450 both work, and
  // an empty field clears rather than becoming 0.
  costAmount: z.union([z.number(), z.string()]).nullable().optional(),
  costCurrency: z.string().optional(),
  reportSubmitted: z.boolean().optional(),
  reportId: z.string().nullable().optional()
});

const toDate = (v) => (v ? new Date(v) : null);
const toText = (v) => (v && String(v).trim() ? String(v).trim() : null);

function buildData(input) {
  const data = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (["plannedFor", "completedAt"].includes(k)) data[k] = toDate(v);
    else if (k === "costAmount") {
      const n = v === null || v === "" ? null : Number(v);
      data[k] = Number.isFinite(n) ? n : null;
    } else if (k === "reportSubmitted") data[k] = Boolean(v);
    else if (k === "reportId") data[k] = v || null;
    else if (["status", "costCurrency"].includes(k)) data[k] = v;
    else data[k] = toText(v);
  }
  // Submitting a report is what sets its timestamp — leaving the UI to
  // remember would mean report dates that silently never got written.
  if (data.reportSubmitted === true) data.reportAt = new Date();
  if (data.reportSubmitted === false) data.reportAt = null;
  return data;
}

// Unlike NDAs, a lead can have several visits over time, so this creates
// rather than upserts.
visitPlansRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const plan = await prisma.visitPlan.create({ data: { leadId, ...buildData(rest) }, include });
  res.status(201).json(plan);
}));

visitPlansRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.partial({ leadId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const plan = await prisma.visitPlan
    .update({ where: { id: req.params.id }, data: buildData(rest), include })
    .catch(() => null);
  if (!plan) return res.status(404).json({ error: "Visit plan not found" });
  res.json(plan);
}));

visitPlansRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await prisma.visitPlan.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "Visit plan not found" });
  res.status(204).end();
}));
