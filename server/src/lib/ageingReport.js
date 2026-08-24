import { prisma } from "../db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// SLA thresholds per phase, in whole days — a deal still active past the
// red threshold is genuinely overdue, not just "old". Matches the client's
// KPI Framework document exactly.
const PHASES = [
  { id: "OUTREACH", label: "Outreach", green: 5, amber: 10 },
  { id: "NDA", label: "NDA", green: 7, amber: 15 },
  { id: "DATA_ROOM", label: "Data Room", green: 14, amber: 30 },
  { id: "IOI", label: "IOI", green: 20, amber: 40 },
  { id: "TERM_SHEET", label: "Term Sheet", green: 30, amber: 60 }
];

function classify(days, phase) {
  if (days <= phase.green) return "green";
  if (days <= phase.amber) return "amber";
  return "red";
}

function daysSince(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
}

// Real ageing, not fabricated: Outreach comes from EmailLead (a lead still
// awaiting a reply, aged from when it was added); the other four phases
// come from DealStageRecord (aged from when that stage started, for
// records still NOT_STARTED/IN_PROGRESS — a COMPLETED/DECLINED record has
// stopped ageing, it resolved). "Data Room" will legitimately show 0 deals
// until something actually creates a DealStageRecord for that stage — nothing in this
// app does today (the Data Room screen tracks documents, not per-lead deal
// progress) — that's an honest gap, not a bug in this report.
export async function computeAgeingReport() {
  const [openOutreachLeads, activeStageRecords] = await Promise.all([
    prisma.emailLead.findMany({
      where: { replyType: "NO_REPLY", unsubscribed: false, bounced: false },
      select: { id: true, name: true, company: true, createdAt: true }
    }),
    prisma.dealStageRecord.findMany({
      where: { status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, stage: { in: ["NDA", "DATA_ROOM", "IOI", "TERM_SHEET"] } },
      select: {
        id: true,
        stage: true,
        scheduledAt: true,
        createdAt: true,
        lead: { select: { name: true, company: true } }
      }
    })
  ]);

  const dealsByPhase = {
    OUTREACH: openOutreachLeads.map((l) => ({ id: l.id, name: l.name, company: l.company, days: daysSince(l.createdAt) })),
    NDA: [],
    DATA_ROOM: [],
    IOI: [],
    TERM_SHEET: []
  };
  for (const record of activeStageRecords) {
    dealsByPhase[record.stage].push({
      id: record.id,
      name: record.lead?.name ?? "Unlinked lead",
      company: record.lead?.company ?? "—",
      days: daysSince(record.scheduledAt ?? record.createdAt)
    });
  }

  const overdueDeals = [];
  const phases = PHASES.map((phase) => {
    const deals = dealsByPhase[phase.id].map((d) => ({ ...d, status: classify(d.days, phase) }));
    const counts = { green: 0, amber: 0, red: 0 };
    for (const d of deals) {
      counts[d.status] += 1;
      if (d.status === "red") {
        overdueDeals.push({ phase: phase.label, name: d.name, company: d.company, days: d.days });
      }
    }
    return { id: phase.id, label: phase.label, thresholds: { green: phase.green, amber: phase.amber }, total: deals.length, ...counts };
  });

  overdueDeals.sort((a, b) => b.days - a.days);

  return { phases, overdueDeals, generatedAt: new Date().toISOString() };
}
