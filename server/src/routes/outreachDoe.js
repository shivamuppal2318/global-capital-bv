import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { doeScorecard, doeOverallMetrics, outreachMetrics, whatsappReplyRateMetrics, zoomBookingMetrics } from "../lib/doeScorecard.js";
import { computeExecutiveKpis } from "../lib/executiveKpis.js";
import { TICKET_SIZE_BANDS, bucketTicketSize } from "../lib/universalFilters.js";
import { normalizeCountryName } from "../lib/countryNames.js";
import { regionForCountry, SALES_REGIONS } from "../lib/salesRegions.js";

// EmailLead.country is a single country ("Germany"); Universal Filters'
// own Geography filter is Lead.territory, a sales region ("DACH",
// "Benelux") -- showing raw countries here made the two screens' Geography
// filters look like they disagreed about what "Geography" even means, even
// though the underlying concept -- which part of the world -- is the same.
// This buckets each country up to that same region vocabulary.
function geographyForEmailLead(l) {
  return regionForCountry(normalizeCountryName(l.country));
}

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
  const leads = await prisma.emailLead.findMany({ where: emailLeadWhere, select: { owner: true, country: true, source: true } });

  // A Channel Partner's own DOE list is just the real owners already on
  // their own referred EmailLeads. An ADMIN sees every real employee (Admin
  // Panel -> Employees) -- EmailLead.owner is free text (CSV imports, "Add
  // to List", the inbound webhook can all set it to anything, including
  // leftover demo/seed values) and an ADMIN account is a login role, not a
  // deal originator, so neither belongs in this dropdown. A non-admin
  // EMPLOYEE only ever gets their own name here -- this screen shows real
  // per-rep performance, and one rep browsing a colleague's numbers through
  // the DOE picker is exactly the leak this locks down.
  let does;
  if (req.channelPartner) {
    does = [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort();
  } else if (req.user.role === "ADMIN") {
    does = [...new Set((await prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { name: true } })).map((e) => e.name))].sort();
  } else {
    does = [req.user.name];
  }

  res.json({
    does,
    // Region, not raw country -- see geographyForEmailLead above. Sorted
    // against SALES_REGIONS' own order (roughly by market size/proximity)
    // rather than alphabetically, so related regions stay grouped in the
    // dropdown instead of scattering (e.g. DACH landing between Central
    // African Republic-adjacent and Cyprus-adjacent alphabetical neighbors).
    geographies: SALES_REGIONS.filter((region) => leads.some((l) => geographyForEmailLead(l) === region)),
    leadSources: [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(),
    // Real CRM Lead attributes (see the "/" handler's convertedLeadById
    // note), same fixed option lists Universal Filters already uses —
    // one source of truth for what "Industry" etc. even mean.
    industries: [...new Set((await prisma.lead.findMany({ where: crmLeadWhere, select: { industry: true } })).map((l) => l.industry).filter(Boolean))].sort(),
    ticketSizeBands: TICKET_SIZE_BANDS.map((b) => ({ key: b.key, label: b.label })),
    temperatures: TEMPERATURES
  });
}));

outreachDoeRouter.get("/", asyncHandler(async (req, res) => {
  const { geography, dateFrom, dateTo, industry, ticketSizeBand, temperature, leadSource } = req.query;
  // Same restriction as /facets, enforced here too so it can't be bypassed
  // by calling this route directly with a different ?doe= -- a non-admin
  // EMPLOYEE's own name always wins over whatever was actually sent.
  const doe = !req.channelPartner && req.user.role !== "ADMIN" ? req.user.name : req.query.doe;

  const [allLeads, allActivity, agents, allMeetings, employees] = await Promise.all([
    prisma.emailLead.findMany({
      where: req.channelPartner ? { campaign: { ownerChannelPartnerId: req.channelPartner.id } } : {},
      select: { id: true, owner: true, country: true, source: true, replyType: true, callBookedAt: true, createdAt: true, convertedToLeadId: true }
    }),
    prisma.emailActivityLog.findMany({ select: { leadId: true, kind: true, createdAt: true } }),
    prisma.agent.findMany({ select: { assignedCount: true, resolvedCount: true } }),
    prisma.meeting.findMany({
      where: req.channelPartner ? { lead: { channelPartner: req.channelPartner.businessName } } : {},
      select: { createdAt: true }
    }),
    // Only needed to filter the per-rep scorecard below -- see that
    // comment for why. Skipped for a Channel Partner request, whose own
    // "DOE" names are real owners on their referred leads, not staff
    // accounts.
    req.channelPartner ? Promise.resolve([]) : prisma.user.findMany({ where: { role: "EMPLOYEE" }, select: { name: true } })
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
    // Compared against the same region /facets offers in the dropdown --
    // matching the raw l.country directly would miss every row whose
    // country is spelled differently, or belongs to the same region under
    // a different country entirely.
    if (geography && geographyForEmailLead(l) !== geography) return false;
    if (leadSource && l.source !== leadSource) return false;
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
  // One row per real employee (Admin Panel -> Employees) — same
  // real-accounts-only restriction /facets' own `does` list already
  // applies. EmailLead.owner is free text (CSV imports, "Add to List",
  // the inbound webhook can all set it to anything, including stale/demo
  // values left over from testing), so an unfiltered groupby would give a
  // row to every one of those instead of just the people who actually
  // work here. `overall` below stays unfiltered — the full historical/
  // imported picture is still there in the combined total, just not
  // exploded into a row per stray name.
  const employeeNames = new Set(employees.map((e) => e.name));
  const scorecard = doeScorecard(
    req.channelPartner ? leads : leads.filter((l) => employeeNames.has(l.owner)),
    activity
  );
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

  const pipelineKpis = (await computeExecutiveKpis({ channelPartner: req.channelPartner })).kpis;

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
