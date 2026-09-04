import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { doeScorecard, doeOverallMetrics, outreachMetrics, whatsappReplyRateMetrics, zoomBookingMetrics } from "../lib/doeScorecard.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";
import { TICKET_SIZE_BANDS, bucketTicketSize } from "../lib/universalFilters.js";

const TEMPERATURES = ["HOT", "WARM", "COLD"];

export const outreachDoeRouter = Router();

// A Channel Partner's Outreach/DOE access is read-only, scoped to their own
// referred cold-outreach leads (via EmailCampaign.ownerChannelPartnerId,
// same mechanism Email Automation itself already uses -- see
// lib/channelPartnerScope.js). /facets lists every DOE's name/geography
// company-wide with no scoping mechanism of its own, so it's refused
// outright for this tier rather than leaking other DOEs' names.
function blockChannelPartner(req, res, next) {
  if (req.channelPartner) {
    return res.status(403).json({ error: "Your account has read-only access to your own referred leads' outreach." });
  }
  next();
}

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

outreachDoeRouter.get("/facets", blockChannelPartner, asyncHandler(async (_req, res) => {
  const leads = await prisma.emailLead.findMany({ select: { owner: true, country: true } });
  res.json({
    does: [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort(),
    geographies: [...new Set(leads.map((l) => l.country).filter(Boolean))].sort(),
    // Real CRM Lead attributes (see the "/" handler's convertedLeadById
    // note), same fixed option lists Universal Filters already uses —
    // one source of truth for what "Industry" etc. even mean.
    industries: [...new Set((await prisma.lead.findMany({ select: { industry: true } })).map((l) => l.industry).filter(Boolean))].sort(),
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
    prisma.meeting.findMany({ select: { createdAt: true } })
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
  const scorecard = doeScorecard(leads, activity);
  const overall = doeOverallMetrics(leads, activity);
  const callsBooked = leads.filter((l) => l.callBookedAt).length;

  // WhatsApp and Zoom are reported company-wide, unfiltered by the leads
  // query above — neither can be attributed to a DOE or a cold-outreach
  // date range with the data this app links today (see doeScorecard.js).
  // That's exactly why this section is nulled out for a Channel Partner:
  // there's no scoping mechanism for it at all, unlike everything else in
  // this response.
  const companyWide = req.channelPartner
    ? { linkedinAcceptanceRate: null, whatsappReplyRate: null, zoomCallsPerDay: null }
    : {
        linkedinAcceptanceRate: null, // no LinkedIn integration exists in this app
        whatsappReplyRate: whatsappReplyRateMetrics(agents).replyRate,
        zoomCallsPerDay: zoomBookingMetrics(allMeetings).perDay
      };

  // Same reasoning as companyWide above -- these are Executive Dashboard's
  // own funnel-stage conversion rates (lib/executiveKpis.js), computed over
  // every CRM lead company-wide with no per-DOE or per-Channel-Partner
  // scoping mechanism, so a Channel Partner gets them nulled out rather
  // than a number that isn't really theirs.
  const pipelineKpis = req.channelPartner ? null : (await computeExecutiveKpis()).kpis;

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
