import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { DEAL_STAGES, DEAL_STAGE_IDS, DEAL_STAGE_STATUSES } from "../lib/dealStages.js";

export const dealStagesRouter = Router();

function publicRecord(r) {
  return {
    id: r.id,
    stage: r.stage,
    status: r.status,
    scheduledAt: r.scheduledAt,
    completedAt: r.completedAt,
    amount: r.amount,
    valuation: r.valuation,
    location: r.location,
    attendees: r.attendees,
    counterparty: r.counterparty,
    notes: r.notes,
    owner: r.owner,
    clientRating: r.clientRating,
    document: r.document ? { id: r.document.id, originalName: r.document.originalName } : null,
    lead: r.lead ? { id: r.lead.id, name: r.lead.name, company: r.lead.company, status: r.lead.status, leadSource: r.lead.leadSource } : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

const include = {
  lead: { select: { id: true, name: true, company: true, status: true, leadSource: true } },
  document: { select: { id: true, originalName: true } }
};

// The stage catalogue, served from the backend so the UI's field config and
// the API's validation can't disagree about what a stage is.
dealStagesRouter.get("/catalogue", (_req, res) => res.json({ stages: DEAL_STAGES, statuses: DEAL_STAGE_STATUSES }));

// Progress across every stage for every lead — powers the summary strip at
// the top of each stage screen.
dealStagesRouter.get("/summary", asyncHandler(async (_req, res) => {
  const [grouped, leadCount] = await Promise.all([
    prisma.dealStageRecord.groupBy({ by: ["stage", "status"], _count: { _all: true } }),
    prisma.lead.count()
  ]);

  const byStage = Object.fromEntries(
    DEAL_STAGE_IDS.map((id) => [id, { total: 0, NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, DECLINED: 0, ON_HOLD: 0 }])
  );
  for (const row of grouped) {
    byStage[row.stage].total += row._count._all;
    byStage[row.stage][row.status] += row._count._all;
  }

  res.json({ leadCount, byStage });
}));

dealStagesRouter.get("/", asyncHandler(async (req, res) => {
  const { stage, status, q } = req.query;
  if (stage && !DEAL_STAGE_IDS.includes(String(stage))) {
    return res.status(400).json({ error: `Unknown stage "${stage}".` });
  }

  const records = await prisma.dealStageRecord.findMany({
    where: {
      ...(stage ? { stage: String(stage) } : {}),
      ...(status && status !== "All" ? { status: String(status) } : {}),
      ...(q
        ? {
            OR: [
              { lead: { name: { contains: String(q), mode: "insensitive" } } },
              { lead: { company: { contains: String(q), mode: "insensitive" } } },
              { counterparty: { contains: String(q), mode: "insensitive" } },
              { notes: { contains: String(q), mode: "insensitive" } }
            ]
          }
        : {})
    },
    include,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });

  res.json(records.map(publicRecord));
}));

const upsertSchema = z.object({
  leadId: z.string().min(1),
  stage: z.enum(DEAL_STAGE_IDS),
  status: z.enum(DEAL_STAGE_STATUSES).optional(),
  // Dates arrive as ISO strings or "" from date inputs; "" clears the field
  // rather than being coerced to the epoch.
  scheduledAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  amount: z.string().nullable().optional(),
  valuation: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  attendees: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  documentId: z.string().nullable().optional(),
  clientRating: z.number().min(0).max(5).nullable().optional()
});

const toDate = (v) => (v ? new Date(v) : null);
const toText = (v) => (v === undefined ? undefined : v && String(v).trim() ? String(v).trim() : null);

// Upsert rather than create: a stage is a property of a lead, and the
// unique [leadId, stage] constraint means "record the NDA for this lead"
// should update the existing row rather than fail on a second attempt.
dealStagesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { leadId, stage, ...rest } = parsed.data;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const data = {
    ...(rest.status !== undefined ? { status: rest.status } : {}),
    ...(rest.scheduledAt !== undefined ? { scheduledAt: toDate(rest.scheduledAt) } : {}),
    ...(rest.completedAt !== undefined ? { completedAt: toDate(rest.completedAt) } : {}),
    amount: toText(rest.amount),
    valuation: toText(rest.valuation),
    location: toText(rest.location),
    attendees: toText(rest.attendees),
    counterparty: toText(rest.counterparty),
    notes: toText(rest.notes),
    owner: toText(rest.owner),
    ...(rest.documentId !== undefined ? { documentId: rest.documentId || null } : {}),
    ...(rest.clientRating !== undefined ? { clientRating: rest.clientRating } : {})
  };
  // Strip keys explicitly set to undefined so they don't clear stored values.
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

  const record = await prisma.dealStageRecord.upsert({
    where: { leadId_stage: { leadId, stage } },
    create: { leadId, stage, ...data },
    update: data,
    include
  });

  res.status(201).json(publicRecord(record));
}));

dealStagesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.partial({ leadId: true, stage: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { leadId, stage, ...rest } = parsed.data;

  const data = {};
  if (rest.status !== undefined) data.status = rest.status;
  if (rest.scheduledAt !== undefined) data.scheduledAt = toDate(rest.scheduledAt);
  if (rest.completedAt !== undefined) data.completedAt = toDate(rest.completedAt);
  for (const key of ["amount", "valuation", "location", "attendees", "counterparty", "notes", "owner"]) {
    if (rest[key] !== undefined) data[key] = toText(rest[key]);
  }
  if (rest.documentId !== undefined) data.documentId = rest.documentId || null;
  if (rest.clientRating !== undefined) data.clientRating = rest.clientRating;

  const record = await prisma.dealStageRecord.update({ where: { id: req.params.id }, data, include }).catch(() => null);
  if (!record) return res.status(404).json({ error: "Stage record not found" });
  res.json(publicRecord(record));
}));

dealStagesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await prisma.dealStageRecord.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "Stage record not found" });
  res.status(204).end();
}));
