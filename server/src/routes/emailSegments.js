import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { filterMatchingLeads, SEGMENT_FIELDS, SEGMENT_OPERATORS } from "../lib/segmentMatching.js";

export const emailSegmentsRouter = Router();

// The field/operator vocabulary the Conditions builder can offer — kept
// server-side (not hardcoded twice) so the frontend's dropdowns always
// match exactly what lib/segmentMatching.js actually knows how to evaluate.
emailSegmentsRouter.get("/fields", (_req, res) => {
  res.json({ fields: SEGMENT_FIELDS, operators: SEGMENT_OPERATORS });
});

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.string().optional().default("")
});

const segmentSchema = z.object({
  name: z.string().min(1),
  campaignId: z.string().min(1).nullable().optional(),
  matchType: z.enum(["ALL", "ANY"]).default("ALL"),
  conditions: z.array(conditionSchema).default([])
});

const campaignSelect = { select: { id: true, name: true } };

// Evaluated live against real EmailLead rows rather than a snapshotted
// count — a segment's matchingCount always reflects the current data, at
// the cost of a query per segment on every list/get. Fine at this app's
// lead volumes; would need caching or a materialized count if that ever
// stopped being true.
async function withMatchingCount(segment) {
  const leads = await prisma.emailLead.findMany({
    where: segment.campaignId ? { campaignId: segment.campaignId } : {}
  });
  return { ...segment, matchingCount: filterMatchingLeads(leads, segment).length, totalInScope: leads.length };
}

emailSegmentsRouter.get("/", asyncHandler(async (_req, res) => {
  const segments = await prisma.emailSegment.findMany({
    orderBy: { createdAt: "desc" },
    include: { campaign: campaignSelect }
  });
  res.json(await Promise.all(segments.map(withMatchingCount)));
}));

emailSegmentsRouter.get("/:id", asyncHandler(async (req, res) => {
  const segment = await prisma.emailSegment.findUnique({
    where: { id: req.params.id },
    include: { campaign: campaignSelect }
  });
  if (!segment) {
    return res.status(404).json({ error: "Segment not found" });
  }
  res.json(await withMatchingCount(segment));
}));

emailSegmentsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = segmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const segment = await prisma.emailSegment.create({
    data: {
      name: parsed.data.name,
      campaignId: parsed.data.campaignId || null,
      matchType: parsed.data.matchType,
      conditions: parsed.data.conditions
    },
    include: { campaign: campaignSelect }
  });

  res.status(201).json(await withMatchingCount(segment));
}));

emailSegmentsRouter.put("/:id", asyncHandler(async (req, res) => {
  const parsed = segmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await prisma.emailSegment.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Segment not found" });
  }

  const segment = await prisma.emailSegment.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.campaignId !== undefined ? { campaignId: parsed.data.campaignId || null } : {}),
      ...(parsed.data.matchType !== undefined ? { matchType: parsed.data.matchType } : {}),
      ...(parsed.data.conditions !== undefined ? { conditions: parsed.data.conditions } : {})
    },
    include: { campaign: campaignSelect }
  });

  res.json(await withMatchingCount(segment));
}));

emailSegmentsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.emailSegment.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Segment not found" });
  }

  await prisma.emailSegment.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));
