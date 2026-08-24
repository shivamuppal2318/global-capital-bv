import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { dealFunnel, ioiMetrics } from "../lib/relationshipMetrics.js";

export const ioiRecordsRouter = Router();

const STATUSES = ["DRAFT", "GENERATED", "SENT", "SIGNED", "DECLINED", "EXPIRED"];

const include = {
  lead: { select: { id: true, name: true, company: true } },
  document: { select: { id: true, originalName: true } }
};

ioiRecordsRouter.get("/", asyncHandler(async (req, res) => {
  const { status, industry, geography, q } = req.query;
  const records = await prisma.ioiRecord.findMany({
    where: {
      ...(status && status !== "All" ? { status: String(status) } : {}),
      ...(industry && industry !== "All" ? { industry: String(industry) } : {}),
      ...(geography && geography !== "All" ? { geography: String(geography) } : {}),
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
    orderBy: { updatedAt: "desc" }
  });
  res.json(records);
}));

// Always over every record, never the filtered view — a KPI that moved when
// you typed in the search box would be misleading.
ioiRecordsRouter.get("/metrics", asyncHandler(async (_req, res) => {
  res.json(ioiMetrics(await prisma.ioiRecord.findMany()));
}));

// NDA -> Zoom call -> Data room -> IOI -> Term sheet.
//
// Each stage unions its dedicated table with the older shared
// DealStageRecord rows: NDA, IOI and visits moved to their own tables, but
// records created before that move still live in the shared one, and a
// funnel that ignored them would show a cliff where the migration happened
// rather than where deals actually drop out.
ioiRecordsRouter.get("/funnel", asyncHandler(async (_req, res) => {
  const [ndaRows, meetingRows, ioiRows, stageRows] = await Promise.all([
    prisma.ndaRecord.findMany({ select: { leadId: true } }),
    prisma.meeting.findMany({ where: { leadId: { not: null } }, select: { leadId: true } }),
    prisma.ioiRecord.findMany({ select: { leadId: true } }),
    prisma.dealStageRecord.findMany({ select: { leadId: true, stage: true } })
  ]);

  const atStage = (stage) => stageRows.filter((r) => r.stage === stage).map((r) => r.leadId);

  res.json(
    dealFunnel({
      nda: [...ndaRows.map((r) => r.leadId), ...atStage("NDA")],
      zoom: [...meetingRows.map((r) => r.leadId), ...atStage("ZOOM_CALL")],
      dataRoom: atStage("DATA_ROOM"),
      ioi: [...ioiRows.map((r) => r.leadId), ...atStage("IOI")],
      termSheet: atStage("TERM_SHEET")
    })
  );
}));

const upsertSchema = z.object({
  leadId: z.string().min(1),
  status: z.enum(STATUSES).optional(),
  generatedAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  signedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  // Sent as a string by the form; coerced so "2000000" and 2000000 both
  // work, and an empty field clears rather than becoming 0.
  value: z.union([z.number(), z.string()]).nullable().optional(),
  valueCurrency: z.string().optional(),
  industry: z.string().nullable().optional(),
  geography: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documentId: z.string().nullable().optional()
});

const DATE_FIELDS = ["generatedAt", "sentAt", "signedAt", "expiresAt"];
const toText = (v) => (v && String(v).trim() ? String(v).trim() : null);

function buildData(input) {
  const data = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (DATE_FIELDS.includes(k)) data[k] = v ? new Date(v) : null;
    else if (k === "value") {
      const n = v === null || v === "" ? null : Number(v);
      data[k] = Number.isFinite(n) ? n : null;
    } else if (k === "documentId") data[k] = v || null;
    else if (["status", "valueCurrency"].includes(k)) data[k] = v;
    else data[k] = toText(v);
  }
  return data;
}

// One IOI per lead (leadId is unique), so this upserts — recording the same
// lead's IOI twice updates it rather than failing on the constraint.
ioiRecordsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const data = buildData(rest);
  const record = await prisma.ioiRecord.upsert({
    where: { leadId },
    create: { leadId, ...data },
    update: data,
    include
  });
  res.status(201).json(record);
}));

// Advancing the lifecycle as a single action, so the UI never has to know
// which timestamp each step writes — and so it can never be forgotten.
const ACTION_FIELD = {
  generate: { field: "generatedAt", status: "GENERATED", label: "Generated" },
  send: { field: "sentAt", status: "SENT", label: "Sent" },
  sign: { field: "signedAt", status: "SIGNED", label: "Signed" }
};

ioiRecordsRouter.post("/:id/:action", asyncHandler(async (req, res) => {
  const step = ACTION_FIELD[req.params.action];
  if (!step) return res.status(400).json({ error: `Unknown action "${req.params.action}".` });

  const existing = await prisma.ioiRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "IOI record not found" });

  // An IOI cannot be sent or signed before it exists as a document.
  // Without this the funnel and the average-value figure would count
  // paperwork nobody has actually produced.
  if (["send", "sign"].includes(req.params.action) && !existing.generatedAt) {
    return res.status(400).json({ error: "Record the generated date before sending or signing." });
  }

  const record = await prisma.ioiRecord.update({
    where: { id: existing.id },
    data: { [step.field]: new Date(), status: step.status },
    include
  });
  res.json(record);
}));

ioiRecordsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = upsertSchema.partial({ leadId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { leadId, ...rest } = parsed.data;
  const record = await prisma.ioiRecord
    .update({ where: { id: req.params.id }, data: buildData(rest), include })
    .catch(() => null);
  if (!record) return res.status(404).json({ error: "IOI record not found" });
  res.json(record);
}));

ioiRecordsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await prisma.ioiRecord.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!deleted) return res.status(404).json({ error: "IOI record not found" });
  res.status(204).end();
}));
