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
import { deriveZoomStage2 } from "../lib/clientPortalStages.js";
import { leadOwnerWhereClause } from "../lib/channelPartnerLeadScope.js";

export const universalFiltersRouter = Router();

// Distinct values for every select-driven filter, so the frontend never
// hardcodes an option list that drifts from what leads actually have.
universalFiltersRouter.get("/facets", asyncHandler(async (req, res) => {
  const leads = await prisma.lead.findMany({
    where: { ...leadOwnerWhereClause(req) },
    select: { id: true, name: true, company: true, doe: true, channelPartner: true, industry: true, territory: true, teamLeader: true, manager: true, leadSource: true },
    orderBy: { name: "asc" }
  });

  const distinct = (field) => [...new Set(leads.map((l) => l[field]).filter(Boolean))].sort();

  // A real, signed-up Channel Partner (routes/channelPartners.js) should be
  // pickable here even before any Lead has actually been tagged with their
  // name -- otherwise this dropdown stays empty until someone manually types
  // a partner's name onto a Lead, which defeats the point of it being a
  // dropdown. Matched by name, same convention channelPartners.js's own
  // withReferredLeads already uses. Only signed partners qualify (an
  // unsigned/prospective one isn't a real referral source yet), and only for
  // staff/admin -- a Channel Partner's own portal has no legitimate need to
  // see the full roster of every other partner's name.
  let channelPartners = distinct("channelPartner");
  if (!req.channelPartner) {
    const signedPartners = await prisma.channelPartner.findMany({
      where: { agreementSignedAt: { not: null } },
      select: { name: true }
    });
    channelPartners = [...new Set([...channelPartners, ...signedPartners.map((p) => p.name)])].sort();
  }

  res.json({
    // Every lead, for the "Lead" filter card's dropdown -- id is the
    // filter value, name/company are what the frontend shows.
    leads: leads.map((l) => ({ id: l.id, name: l.name, company: l.company })),
    does: distinct("doe"),
    channelPartners,
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
// same tables rather than trusting a stale stored value. Only `leads`
// itself is scoped to a Channel Partner's own referred leads -- the other
// five queries stay company-wide and are only ever used internally to
// build per-leadId lookup Maps/Sets, never returned directly, so the final
// leads.map(...) below only ever iterates the already-scoped lead set.
async function buildRows(req) {
  const [leads, ndaRecords, meetings, ioiRecords, visitPlans, stageRows] = await Promise.all([
    prisma.lead.findMany({ where: { ...leadOwnerWhereClause(req) } }),
    prisma.ndaRecord.findMany({ select: { leadId: true, expiresAt: true } }),
    prisma.meeting.findMany({ where: { leadId: { not: null } }, select: { leadId: true, startTime: true, status: true, nextActionDueAt: true } }),
    prisma.ioiRecord.findMany({ select: { leadId: true } }),
    prisma.visitPlan.findMany({ select: { leadId: true, status: true, plannedFor: true } }),
    prisma.dealStageRecord.findMany({ select: { leadId: true, stage: true } })
  ]);

  const atStage = (stage) => new Set(stageRows.filter((r) => r.stage === stage).map((r) => r.leadId));

  // Reuses clientPortalStages.js's deriveZoomStage2 as-is -- same
  // "chronologically the 2nd meeting, completed" rule leadPipeline.js's
  // own ZOOM_CALL_2 stage already applies, so this screen's Lifecycle
  // Phase filter can't disagree with a lead's own Deal Journey panel.
  const meetingsByLead = new Map();
  for (const m of meetings) {
    if (!meetingsByLead.has(m.leadId)) meetingsByLead.set(m.leadId, []);
    meetingsByLead.get(m.leadId).push(m);
  }
  const zoomCall2 = new Set(
    [...meetingsByLead.entries()].filter(([, ms]) => deriveZoomStage2(ms).status === "completed").map(([leadId]) => leadId)
  );

  const membership = {
    outreach: new Set(leads.filter((l) => l.status !== "NEW").map((l) => l.id)),
    nda: new Set([...ndaRecords.map((r) => r.leadId), ...atStage("NDA")]),
    zoom: new Set([...meetings.map((m) => m.leadId), ...atStage("ZOOM_CALL")]),
    dataRoom: atStage("DATA_ROOM"),
    ioi: new Set([...ioiRecords.map((r) => r.leadId), ...atStage("IOI")]),
    zoomCall2,
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
  const rows = await buildRows(req);
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
