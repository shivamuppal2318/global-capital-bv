import { prisma } from "../db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// SLA thresholds per phase, in whole days — a deal still active past the
// red threshold is genuinely overdue, not just "old". Matches the client's
// KPI Framework document exactly. `navigateTo` is the sidebar nav id each
// phase's deals actually live under, so the UI can jump straight there.
const PHASES = [
  { id: "OUTREACH", label: "Outreach", green: 5, amber: 10, navigateTo: "cold-bulk-mailing" },
  { id: "NDA", label: "NDA", green: 7, amber: 15, navigateTo: "nda" },
  { id: "DATA_ROOM", label: "Data Room", green: 14, amber: 30, navigateTo: "data-room" },
  { id: "IOI", label: "IOI", green: 20, amber: 40, navigateTo: "ioi" },
  { id: "TERM_SHEET", label: "Term Sheet", green: 30, amber: 60, navigateTo: "term-sheet" }
];

function classify(days, phase) {
  if (days <= phase.green) return "green";
  if (days <= phase.amber) return "amber";
  return "red";
}

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
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
//   - Term Sheet: DealStageRecord(stage=TERM_SHEET) still open — this is
//     the one stage that hasn't outgrown the shared table yet.
export async function computeAgeingReport() {
  const [openOutreachLeads, openNdaRecords, dataRoomStageRecords, openIoiRecords, termSheetStageRecords] = await Promise.all([
    prisma.emailLead.findMany({
      where: { replyType: "NO_REPLY", unsubscribed: false, bounced: false },
      select: { id: true, name: true, company: true, owner: true, createdAt: true }
    }),
    prisma.ndaRecord.findMany({
      where: { status: { notIn: ["SIGNED", "DECLINED", "EXPIRED"] } },
      select: { id: true, sentAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.dealStageRecord.findMany({
      where: { stage: "DATA_ROOM", status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
      select: { id: true, scheduledAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.ioiRecord.findMany({
      where: { status: { notIn: ["SIGNED", "DECLINED", "EXPIRED"] } },
      select: { id: true, sentAt: true, generatedAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    }),
    prisma.dealStageRecord.findMany({
      where: { stage: "TERM_SHEET", status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
      select: { id: true, scheduledAt: true, createdAt: true, owner: true, lead: { select: { name: true, company: true } } }
    })
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
    TERM_SHEET: termSheetStageRecords.map((r) => ({
      id: r.id,
      name: r.lead?.name ?? "Unlinked lead",
      company: r.lead?.company ?? "—",
      owner: r.owner || null,
      days: daysSince(r.scheduledAt ?? r.createdAt)
    }))
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

  return { phases, overdueDeals, byOwner, generatedAt: new Date().toISOString() };
}
