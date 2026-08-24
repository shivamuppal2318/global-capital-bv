import { prisma } from "../db.js";

// "DOE" (Deal Originator Executive) has no dedicated identity model — it's
// a free-text name that happens to appear as `owner` on three otherwise
// unrelated tables (EmailLead, Lead, DealStageRecord). This aggregates
// across all three by exact (trimmed) name match, which is the best real
// signal available without adding a User-linked "assignedTo" relation to
// every one of those models — a bigger change than this KPI needs. A DOE
// whose name is spelled inconsistently between modules will under-count;
// that's a real data-entry problem this can't paper over, not a bug here.
async function listDoeNames() {
  const [emailOwners, leadOwners, stageOwners] = await Promise.all([
    prisma.emailLead.findMany({ distinct: ["owner"], select: { owner: true } }),
    prisma.lead.findMany({ where: { owner: { not: null } }, distinct: ["owner"], select: { owner: true } }),
    prisma.dealStageRecord.findMany({ where: { owner: { not: null } }, distinct: ["owner"], select: { owner: true } })
  ]);
  const names = new Set();
  for (const row of [...emailOwners, ...leadOwners, ...stageOwners]) {
    const name = row.owner?.trim();
    if (name) names.add(name);
  }
  return [...names].sort();
}

// Average hours between a lead's REPLY_RECEIVED and the next
// BRANCH_EMAIL_SENT for that same lead — a real measure of how fast a DOE
// follows up on a reply. Computed in JS after fetching the raw rows rather
// than a SQL window function, since Prisma has no portable LEAD()/LAG().
function averageFollowUpHours(activityRows) {
  const byLead = new Map();
  for (const row of activityRows) {
    if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
    byLead.get(row.leadId).push(row);
  }

  const gaps = [];
  for (const rows of byLead.values()) {
    rows.sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind !== "REPLY_RECEIVED") continue;
      const nextSend = rows.slice(i + 1).find((r) => r.kind === "BRANCH_EMAIL_SENT");
      if (nextSend) {
        gaps.push((nextSend.createdAt - rows[i].createdAt) / (1000 * 60 * 60));
      }
    }
  }
  return gaps.length > 0 ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null;
}

// Real per-DOE aggregates for the DOE Performance dashboard — every number
// here is a live count/average over EmailActivityLog, Meeting and
// DealStageRecord, nothing formula-estimated.
export async function computeDoePerformance() {
  const doeNames = await listDoeNames();

  const results = await Promise.all(
    doeNames.map(async (doe) => {
      const [sentCount, activityRows, zoomCalls, ndaSigned, dealsProgressed, emailLeadsTotal, emailLeadsHealthy] = await Promise.all([
        prisma.emailActivityLog.count({ where: { kind: { in: ["BULK_INTRO_SENT", "BRANCH_EMAIL_SENT"] }, lead: { owner: doe } } }),
        prisma.emailActivityLog.findMany({
          where: { kind: { in: ["REPLY_RECEIVED", "BRANCH_EMAIL_SENT"] }, lead: { owner: doe } },
          select: { leadId: true, kind: true, createdAt: true }
        }),
        prisma.meeting.count({ where: { lead: { owner: doe } } }),
        prisma.dealStageRecord.count({ where: { stage: "NDA", status: "COMPLETED", owner: doe } }),
        prisma.dealStageRecord.count({ where: { status: "COMPLETED", owner: doe } }),
        prisma.emailLead.count({ where: { owner: doe } }),
        prisma.emailLead.count({ where: { owner: doe, bounced: false } })
      ]);

      const responses = activityRows.filter((r) => r.kind === "REPLY_RECEIVED").length;

      return {
        doe,
        totalOutreach: sentCount,
        responses,
        zoomCalls,
        ndaSigned,
        dealsProgressed,
        responseRate: sentCount > 0 ? Math.round((responses / sentCount) * 1000) / 10 : null,
        // % of this DOE's email leads that never hard/soft-bounced — a real
        // deliverability-quality signal distinct from response rate.
        outreachQuality: emailLeadsTotal > 0 ? Math.round((emailLeadsHealthy / emailLeadsTotal) * 1000) / 10 : null,
        avgFollowUpHours: averageFollowUpHours(activityRows)
      };
    })
  );

  return results.sort((a, b) => b.totalOutreach - a.totalOutreach);
}
