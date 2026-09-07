import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { doeScorecard, doeOverallMetrics, outreachMetrics, whatsappReplyRateMetrics, zoomBookingMetrics } from "../lib/doeScorecard.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";
import { TICKET_SIZE_BANDS, bucketTicketSize } from "../lib/universalFilters.js";

const TEMPERATURES = ["HOT", "WARM", "COLD"];

export const outreachDoeRouter = Router();

// Targets from the spec — not stored anywhere, just the fixed goals the
// scorecard is measured against.
const TARGETS = {
  outreachPerDay: 30,
  positiveResponseRate: 20,
  linkedinAcceptanceRate: 35,
  coldEmailOpenRate: 45,
  whatsappReplyRate: 30,
  zoomCallsPerDay: 2
};

outreachDoeRouter.get("/facets", asyncHandler(async (req, res) => {
  const emailLeadWhere = req.channelPartner ? { campaign: { ownerChannelPartnerId: req.channelPartner.id } } : {};
  const crmLeadWhere = req.channelPartner ? { channelPartner: req.channelPartner.businessName } : {};
  const leads = await prisma.emailLead.findMany({ where: emailLeadWhere, select: { owner: true, country: true } });

  const does = req.channelPartner
    ? [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort()
    : [...new Set((await prisma.user.findMany({ select: { name: true } })).map((e) => e.name))].sort();

  res.json({
    does,
    geographies: [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(),
    // Real CRM Lead attributes (see the "/" handler's convertedLeadById
    // note), same fixed option lists Universal Filters already uses —
    // one source of truth for what "Industry" etc. even mean.
    industries: [...new Set((await prisma.lead.findMany({ where: crmLeadWhere, select: { industry: true } })).map((l) => l.industry).filter(Boolean))].sort(),
    ticketSizeBands: TICKET_SIZE_BANDS.map((b) => ({ key: b.key, label: b.label })),
    temperatures: TEMPERATURES
  });
}));

outreachDoeRouter.get("/", asyncHandler(async (req, res) => {
  const { doe, geography, dateFrom, dateTo, industry, ticketSizeBand, temperature } = req.query;

  const [allLeads, allActivity, agents, allMeetings] = await Promise.all([
    prisma.emailLead.findMany({
      where: req.channelPartner ? { campaign: { ownerChannelPartnerId: req.channelPartner.id } } : {},
      select: { id: true, owner: true, country: true, replyType: true, callBookedAt: true, createdAt: true, convertedToLeadId: true }
    }),
    prisma.emailActivityLog.findMany({ select: { leadId: true, kind: true, createdAt: true } }),
    prisma.agent.findMany({ select: { assignedCount: true, resolvedCount: true } }),
    prisma.meeting.findMany({
      where: req.channelPartner ? { lead: { channelPartner: req.channelPartner.businessName } } : {},
      select: { createdAt: true }
    })
  ]);

  // Industry/Ticket Size/Hot-Warm-Cold live on the CRM Lead this
  // cold-outreach contact became, not on the EmailLead itself --
  // convertedToLeadId (set by POST /api/leads/from-email-lead/:id) is the
  // real link. A contact nobody has converted yet has no real value for
  // any of these three and simply won't match a filter on them, rather
  // than guessing at one.
  const convertedLeadIds = allLeads.map((l) => l.convertedToLeadId).filter(Boolean);
  const convertedLeads = convertedLeadIds.length
    ? await prisma.lead.findMany({ where: { id: { in: convertedLeadIds } }, select: { id: true, industry: true, capitalAsk: true, temperature: true } })
    : [];
  const convertedLeadById = new Map(convertedLeads.map((l) => [l.id, l]));

  const leads = allLeads.filter((l) => {
    if (doe && l.owner !== doe) return false;
    if (geography && l.country !== geography) return false;
    if (dateFrom && l.createdAt < new Date(dateFrom)) return false;
    if (dateTo && l.createdAt > new Date(dateTo)) return false;

    if (industry || ticketSizeBand || temperature) {
      const converted = l.convertedToLeadId ? convertedLeadById.get(l.convertedToLeadId) : null;
      if (!converted) return false;
      if (industry && converted.industry !== industry) return false;
      if (ticketSizeBand && bucketTicketSize(converted.capitalAsk) !== ticketSizeBand) return false;
      if (temperature && converted.temperature !== temperature) return false;
    }
    return true;
  });
  const leadIds = new Set(leads.map((l) => l.id));
  const activity = allActivity.filter((a) => leadIds.has(a.leadId));

  const top = outreachMetrics(leads);
  // The per-row breakdown only makes sense for real people -- EmailLead.owner
  // is free text (see /facets' own comment above), so grouping by every
  // distinct value here would give a "DOE" row to leftover demo/seed owner
  // names that were never a real employee. overall (the "All DOEs" combined
  // total) below is intentionally still computed over every real lead
  // regardless of owner, since that total is meant to be everyone's
  // combined activity, not just the named employees'.
  const employeeNames = new Set((await prisma.user.findMany({ select: { name: true } })).map((e) => e.name));
  const scorecard = doeScorecard(leads.filter((l) => employeeNames.has(l.owner)), activity);
  const overall = doeOverallMetrics(leads, activity);
  const callsBooked = leads.filter((l) => l.callBookedAt).length;

  // WhatsApp remains staff-only because Agent rows are not linked to a
  // channel partner. Zoom can be scoped for partners through Meeting.lead,
  // so their portal gets its own booked-call rate rather than nothing.
  const companyWide = {
    linkedinAcceptanceRate: null, // no LinkedIn integration exists in this app
    whatsappReplyRate: req.channelPartner ? null : whatsappReplyRateMetrics(agents).replyRate,
    zoomCallsPerDay: zoomBookingMetrics(allMeetings).perDay
  };

  const pipelineKpis = (await computeExecutiveKpis(req.channelPartner)).kpis;

  res.json({
    targets: TARGETS,
    top: {
      outreachSent: top.totalOutreach,
      responses: top.responded,
      callsBooked,
      responseRate: top.responseRate
    },
    scorecard,
    overall,
    companyWide,
    pipelineKpis
  });
}));
