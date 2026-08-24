import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { doeScorecard, doeOverallMetrics, outreachMetrics, whatsappReplyRateMetrics, zoomBookingMetrics } from "../lib/doeScorecard.js";

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

outreachDoeRouter.get("/facets", asyncHandler(async (_req, res) => {
  const leads = await prisma.emailLead.findMany({ select: { owner: true, country: true } });
  res.json({
    does: [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort(),
    geographies: [...new Set(leads.map((l) => l.country).filter(Boolean))].sort()
  });
}));

outreachDoeRouter.get("/", asyncHandler(async (req, res) => {
  const { doe, geography, dateFrom, dateTo } = req.query;

  const [allLeads, allActivity, agents, allMeetings] = await Promise.all([
    prisma.emailLead.findMany({ select: { id: true, owner: true, country: true, replyType: true, callBookedAt: true, createdAt: true } }),
    prisma.emailActivityLog.findMany({ select: { leadId: true, kind: true, createdAt: true } }),
    prisma.agent.findMany({ select: { assignedCount: true, resolvedCount: true } }),
    prisma.meeting.findMany({ select: { createdAt: true } })
  ]);

  const leads = allLeads.filter((l) => {
    if (doe && l.owner !== doe) return false;
    if (geography && l.country !== geography) return false;
    if (dateFrom && l.createdAt < new Date(dateFrom)) return false;
    if (dateTo && l.createdAt > new Date(dateTo)) return false;
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
  const whatsapp = whatsappReplyRateMetrics(agents);
  const zoom = zoomBookingMetrics(allMeetings);

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
    companyWide: {
      linkedinAcceptanceRate: null, // no LinkedIn integration exists in this app
      whatsappReplyRate: whatsapp.replyRate,
      zoomCallsPerDay: zoom.perDay
    }
  });
}));
