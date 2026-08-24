import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  bucketTicketSize,
  deriveLifecyclePhase,
  deriveNextActionDue,
  bucketDueWindow,
  matchesFilters
} from "../lib/universalFilters.js";

export const universalFiltersRouter = Router();

// Distinct values for every select-driven filter, so the frontend never
// hardcodes an option list that drifts from what leads actually have.
universalFiltersRouter.get("/facets", asyncHandler(async (_req, res) => {
  const leads = await prisma.lead.findMany({
    select: { doe: true, channelPartner: true, industry: true, territory: true, teamLeader: true, manager: true, leadSource: true }
  });

  const distinct = (field) => [...new Set(leads.map((l) => l[field]).filter(Boolean))].sort();

  res.json({
    does: distinct("doe"),
    channelPartners: distinct("channelPartner"),
    industries: distinct("industry"),
    geographies: distinct("territory"),
    teamLeaders: distinct("teamLeader"),
    managers: distinct("manager"),
    leadSources: distinct("leadSource")
  });
}));

// Builds the per-lead rows the filter matches against — the two derived
// dimensions (lifecycle phase, next action due) need the same relationship
// data the Executive Dashboard's funnel already fetches, so this pulls the
// same tables rather than trusting a stale stored value.
async function buildRows() {
  const [leads, ndaRecords, meetings, ioiRecords, visitPlans, stageRows] = await Promise.all([
    prisma.lead.findMany(),
    prisma.ndaRecord.findMany({ select: { leadId: true, expiresAt: true } }),
    prisma.meeting.findMany({ where: { leadId: { not: null } }, select: { leadId: true, nextActionDueAt: true } }),
    prisma.ioiRecord.findMany({ select: { leadId: true } }),
    prisma.visitPlan.findMany({ select: { leadId: true, status: true, plannedFor: true } }),
    prisma.dealStageRecord.findMany({ select: { leadId: true, stage: true } })
  ]);

  const atStage = (stage) => new Set(stageRows.filter((r) => r.stage === stage).map((r) => r.leadId));
  const membership = {
    outreach: new Set(leads.filter((l) => l.status !== "NEW").map((l) => l.id)),
    nda: new Set([...ndaRecords.map((r) => r.leadId), ...atStage("NDA")]),
    zoom: new Set([...meetings.map((m) => m.leadId), ...atStage("ZOOM_CALL")]),
    dataRoom: atStage("DATA_ROOM"),
    ioi: new Set([...ioiRecords.map((r) => r.leadId), ...atStage("IOI")]),
    fieldVisit: new Set([
      ...visitPlans.filter((p) => p.status === "COMPLETED").map((p) => p.leadId),
      ...atStage("FIELD_VISIT")
    ]),
    termSheet: atStage("TERM_SHEET")
  };

  const nextActionByLead = new Map();
  for (const m of meetings) {
    if (m.nextActionDueAt) nextActionByLead.set(m.leadId, [...(nextActionByLead.get(m.leadId) ?? []), m.nextActionDueAt]);
  }
  for (const p of visitPlans) {
    if (p.plannedFor && !["COMPLETED", "CANCELLED"].includes(p.status)) {
      nextActionByLead.set(p.leadId, [...(nextActionByLead.get(p.leadId) ?? []), p.plannedFor]);
    }
  }
  for (const r of ndaRecords) {
    if (r.expiresAt) nextActionByLead.set(r.leadId, [...(nextActionByLead.get(r.leadId) ?? []), r.expiresAt]);
  }

  return leads.map((lead) => {
    const phase = deriveLifecyclePhase(lead.id, membership);
    const dueDate = deriveNextActionDue(nextActionByLead.get(lead.id) ?? []);

    return {
      ...lead,
      lifecyclePhase: phase.key,
      lifecyclePhaseLabel: phase.label,
      ticketSizeBand: bucketTicketSize(lead.capitalAsk),
      nextActionDue: dueDate,
      dueWindow: bucketDueWindow(dueDate)
    };
  });
}

universalFiltersRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await buildRows();
  const matched = rows.filter((row) => matchesFilters(row, req.query));

  res.json({
    total: matched.length,
    leads: matched
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 500) // the filter bar is a working set, not a full export
      .map((row) => ({
        id: row.id,
        name: row.name,
        company: row.company,
        status: row.status,
        lifecyclePhase: row.lifecyclePhase,
        lifecyclePhaseLabel: row.lifecyclePhaseLabel,
        industry: row.industry,
        territory: row.territory,
        channelPartner: row.channelPartner,
        ticketSizeBand: row.ticketSizeBand,
        capitalAsk: row.capitalAsk,
        temperature: row.temperature,
        teamLeader: row.teamLeader,
        manager: row.manager,
        leadSource: row.leadSource,
        owner: row.owner,
        doe: row.doe,
        nextActionDue: row.nextActionDue,
        dueWindow: row.dueWindow,
        createdAt: row.createdAt
      }))
  });
}));
