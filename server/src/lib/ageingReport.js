import { prisma } from "../db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// SLA thresholds per phase, in whole days — a deal still active past the
// red threshold is genuinely overdue, not just "old". Matches the client's
// KPI Framework document exactly. `navigateTo` is the sidebar nav id each
// phase's deals actually live under, so the UI can jump straight there.
// Zoom Call / Zoom Call 2 / Field Visit thresholds are estimated (no client
// KPI Framework figure for these three exists yet, unlike the original
// five) -- picked to fit the same "later stage, more slack" progression the
// real ones already show, not pulled from any spec. Adjust freely once
// real numbers exist.
const PHASES = [
  { id: "OUTREACH", label: "Outreach", green: 5, amber: 10, navigateTo: "leads" },
  { id: "NDA", label: "NDA", green: 7, amber: 15, navigateTo: "nda" },
  { id: "ZOOM_CALL", label: "Zoom Call 1", green: 7, amber: 14, navigateTo: "meetings" },
  { id: "DATA_ROOM", label: "Data Room", green: 14, amber: 30, navigateTo: "data-room" },
  { id: "IOI", label: "IOI", green: 20, amber: 40, navigateTo: "ioi" },
  { id: "ZOOM_CALL_2", label: "Zoom Call 2", green: 10, amber: 20, navigateTo: "meetings" },
  { id: "FIELD_VISIT", label: "Field Visit", green: 14, amber: 30, navigateTo: "field-visit" },
  { id: "TERM_SHEET", label: "Term Sheet", green: 30, amber: 60, navigateTo: "term-sheet" }
];

const FOLLOW_UP_GRACE_DAYS = 1;

function classify(days, phase) {
  if (days <= phase.green) return "green";
  if (days <= phase.amber) return "amber";
  return "red";
}

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
}

async function staleInterestedReplies(channelPartner) {
  const outreachWhere = channelPartner ? { campaign: { ownerChannelPartnerId: channelPartner.id } } : {};
  const interested = await prisma.emailLead.findMany({
    where: {
      replyType: "INTERESTED",
      convertedToLeadId: { not: null },
      ...outreachWhere
    },
    select: {
      id: true,
      name: true,
      company: true,
      owner: true,
      convertedToLeadId: true,
      convertedAt: true,
      updatedAt: true
    }
  });

  const convertedLeadIds = interested.map((lead) => lead.convertedToLeadId).filter(Boolean);
  if (convertedLeadIds.length === 0) return [];

  const crmLeads = await prisma.lead.findMany({
    where: { id: { in: convertedLeadIds } },
    select: {
      id: true,
      name: true,
      company: true,
      owner: true,
      doe: true,
      channelPartner: true,
      _count: {
        select: {
          meetings: true,
          dealStages: true,
          visitPlans: true,
          documents: true,
          activity: true
        }
      },
      ndaRecord: { select: { id: true } },
      ioiRecord: { select: { id: true } }
    }
  });
  const crmLeadById = new Map(crmLeads.map((lead) => [lead.id, lead]));

  return interested
    .map((emailLead) => {
      const crmLead = crmLeadById.get(emailLead.convertedToLeadId);
      if (!crmLead) return null;
      const followUpCount =
        crmLead._count.meetings +
        crmLead._count.dealStages +
        (crmLead.ndaRecord ? 1 : 0) +
        (crmLead.ioiRecord ? 1 : 0) +
        crmLead._count.visitPlans +
        crmLead._count.documents +
        crmLead._count.activity;
      const anchorDate = emailLead.convertedAt ?? emailLead.updatedAt;
      return {
        id: crmLead.id,
        name: crmLead.name || emailLead.name,
        company: crmLead.company || emailLead.company,
        owner: crmLead.doe || crmLead.owner || emailLead.owner || null,
        channelPartner: crmLead.channelPartner || null,
        days: daysSince(anchorDate),
        followUpCount
      };
    })
    .filter((lead) => lead && lead.followUpCount === 0 && lead.days >= FOLLOW_UP_GRACE_DAYS)
    .sort((a, b) => b.days - a.days)
    .map(({ followUpCount, ...lead }) => lead);
}

// Zoom Call 1 and 2 both live on the same Meeting table, one row per real
// call, so both phases are computed from one shared fetch/group-by-lead
// pass rather than two separate queries. Mirrors
// leadPipeline.js's zoomCall and clientPortalStages.js's deriveZoomStage2
// exactly, just re-expressed as "which leads are still open" instead of
// "what's this one lead's status" -- same rules, opposite direction.
async function meetingAgeing(leadWhere) {
  const meetings = await prisma.meeting.findMany({
    where: { leadId: { not: null }, ...leadWhere },
    select: { id: true, leadId: true, startTime: true, status: true, createdAt: true, lead: { select: { name: true, company: true, owner: true, doe: true } } },
    orderBy: { startTime: "asc" }
  });

  const byLead = new Map();
  for (const m of meetings) {
    if (!byLead.has(m.leadId)) byLead.set(m.leadId, []);
    byLead.get(m.leadId).push(m);
  }

  const openZoomCall1 = [];
  const openZoomCall2 = [];
  const now = Date.now();

  for (const [leadId, leadMeetings] of byLead) {
    const lead = leadMeetings[0].lead;
    const owner = lead?.doe || lead?.owner || null;
    const name = lead?.name ?? "Unlinked lead";
    const company = lead?.company ?? "—";

    const hasHappened = leadMeetings.some((m) => new Date(m.startTime).getTime() < now);
    if (!hasHappened) {
      openZoomCall1.push({ id: leadId, name, company, owner, days: daysSince(leadMeetings[0].createdAt) });
    }

    if (leadMeetings.length >= 2) {
      const second = leadMeetings[1];
      if (second.status === "Scheduled" && new Date(second.startTime).getTime() > now) {
        openZoomCall2.push({ id: leadId, name, company, owner, days: daysSince(second.createdAt) });
      }
    }
  }

  return { openZoomCall1, openZoomCall2 };
}

// Real ageing, not fabricated, sourced from whichever table each phase
// actually lives in today:
//   - Outreach: EmailLead still awaiting a reply, aged from when it was added.
//   - NDA: NdaRecord (its own dedicated table — see routes/ndaRecords.js),
//     for anything not yet SIGNED/DECLINED/EXPIRED, aged from sentAt.
//   - Data Room: DealStageRecord(stage=DATA_ROOM) still open. Will
//     legitimately show 0 until something creates one — nothing in this app
//     does today (the Data Room screen tracks documents, not per-lead deal
//     progress) — an honest gap, not a bug.
//   - IOI: IoiRecord (its own dedicated table), for anything not yet
//     SIGNED/DECLINED/EXPIRED, aged from sentAt (or generatedAt if never sent).
//   - Zoom Call 1 / 2: Meeting rows, grouped per lead (see meetingAgeing
//     above) — 1 is open while at least one call is booked but none has
//     happened yet; 2 is open while the chronologically-second call is
//     still a future Scheduled one, same rules leadPipeline.js's own
//     per-lead status already uses.
//   - Field Visit: DealStageRecord(stage=FIELD_VISIT) still open.
//   - Term Sheet: DealStageRecord(stage=TERM_SHEET) still open — this is
//     the one stage that hasn't outgrown the shared table yet.
// `channelPartner` (optional): a { id, businessName } pair -- scopes every
// phase to just that partner's own referred leads when passed (Outreach
// via EmailCampaign.ownerChannelPartnerId, everything else via
// Lead.channelPartner), full company-wide view otherwise. See
// server/src/routes/ageingReport.js.
export async function computeAgeingReport(channelPartner = null) {
  const outreachWhere = channelPartner ? { campaign: { ownerChannelPartnerId: channelPartner.id } } : {};
  const leadWhere = channelPartner ? { lead: { channelPartner: channelPartner.businessName } } : {};

  const [openOutreachLeads, openNdaRecords, dataRoomStageRecords, openIoiRecords, fieldVisitStageRecords, termSheetStageRecords, meetingResults, staleInterested] = await Promise.all([
    prisma.emailLead.findMany({
      where: { replyType: "NO_REPLY", unsubscribed: false, bounced: false, ...outreachWhere },
      select: { id: true, name: true, company: true, owner: true, createdAt: true }
    }),
    prisma.ndaRecord.findMany({
      where: { status: { notIn: ["SIGNED", "DECLINED", "EXPIRED"] }, ...leadWhere },
      select: { id: true, sentAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.dealStageRecord.findMany({
      where: { stage: "DATA_ROOM", status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, ...leadWhere },
      select: { id: true, scheduledAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.ioiRecord.findMany({
      where: { status: { notIn: ["SIGNED", "DECLINED", "EXPIRED"] }, ...leadWhere },
      select: { id: true, sentAt: true, generatedAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.dealStageRecord.findMany({
      where: { stage: "FIELD_VISIT", status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, ...leadWhere },
      select: { id: true, scheduledAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.dealStageRecord.findMany({
      where: { stage: "TERM_SHEET", status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, ...leadWhere },
      select: { id: true, scheduledAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    meetingAgeing(leadWhere),
    staleInterestedReplies(channelPartner)
  ]);

  const dealsByPhase = {
    OUTREACH: openOutreachLeads.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company,
      owner: l.owner || null,
      days: daysSince(l.createdAt)
    })),
    NDA: openNdaRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.sentAt ?? r.createdAt)
    })),
    DATA_ROOM: dataRoomStageRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.scheduledAt ?? r.createdAt)
    })),
    IOI: openIoiRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.sentAt ?? r.generatedAt ?? r.createdAt)
    })),
    FIELD_VISIT: fieldVisitStageRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.scheduledAt ?? r.createdAt)
    })),
    TERM_SHEET: termSheetStageRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.scheduledAt ?? r.createdAt)
    })),
    ZOOM_CALL: meetingResults.openZoomCall1,
    ZOOM_CALL_2: meetingResults.openZoomCall2
  };

  const overdueByOwner = new Map();
  const overdueDeals = [];

  const phases = PHASES.map((phase) => {
    // Worst (most overdue) first within a phase — the deal needing
    // attention soonest is what a manager scanning this report wants on top,
    // not creation order.
    const deals = dealsByPhase[phase.id]
      .map((d) => ({ ...d, status: classify(d.days, phase) }))
      .sort((a, b) => b.days - a.days);

    const counts = { green: 0, amber: 0, red: 0 };
    for (const d of deals) {
      counts[d.status] += 1;
      if (d.status === "red") {
        const ownerKey = d.owner ?? "Unassigned";
        overdueByOwner.set(ownerKey, (overdueByOwner.get(ownerKey) ?? 0) + 1);
        overdueDeals.push({ phase: phase.label, name: d.name, company: d.company, owner: d.owner, days: d.days, navigateTo: phase.navigateTo });
      }
    }

    return {
      id: phase.id,
      label: phase.label,
      navigateTo: phase.navigateTo,
      thresholds: { green: phase.green, amber: phase.amber },
      total: deals.length,
      ...counts,
      deals
    };
  });

  overdueDeals.sort((a, b) => b.days - a.days);

  const byOwner = [...overdueByOwner.entries()]
    .map(([owner, overdueCount]) => ({ owner, overdueCount }))
    .sort((a, b) => b.overdueCount - a.overdueCount);

  return { phases, overdueDeals, byOwner, staleInterested, generatedAt: new Date().toISOString() };
}
