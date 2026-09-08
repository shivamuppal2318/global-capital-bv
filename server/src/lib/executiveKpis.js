// The company-wide pipeline KPI computation behind Executive Dashboard --
// extracted out of routes/executiveDashboard.js so routes/outreachDoe.js
// can show the same numbers on its own scorecard without a second,
// separately-maintained copy of this logic. Same reasoning as this
// codebase's other shared derivation functions (deriveZoomStage2, etc.):
// two screens showing the same metric must never be able to disagree.
import { prisma } from "../db.js";
import { REQUIRED_DOCUMENT_LABELS } from "./requiredDocuments.js";
import { ndaMetrics, callMetrics, ioiMetrics, visitMetrics } from "./relationshipMetrics.js";
import {
  executiveFunnel,
  outreachMetrics,
  dealAgeMetrics,
  winRateMetrics,
  activeDealsMetrics,
  pipelineValueMetrics
} from "./executiveMetrics.js";

// `doeName`, when set, scopes every query down to just that DOE's own
// work -- each model's own `owner` field where it has one (NdaRecord,
// IoiRecord, VisitPlan, DealStageRecord, EmailLead, and Lead.owner itself),
// falling back to the owning Lead's `owner` for the two models with no
// owner field of their own (Meeting, Document). Left unscoped ({}) when
// `doeName` isn't given, which is the only way routes/outreachDoe.js calls
// this today -- its own pipelineKpis stay company-wide by design.
export async function computeExecutiveKpis({ doeName } = {}) {
  const ownerWhere = doeName ? { owner: doeName } : {};
  const relatedLeadOwnerWhere = doeName ? { lead: { owner: doeName } } : {};

  const [leads, emailLeads, ndaRecords, meetings, documentCategories, ioiRecords, visitPlans, stageRows] =
    await Promise.all([
      prisma.lead.findMany({ where: ownerWhere, select: { id: true, status: true, createdAt: true } }),
      prisma.emailLead.findMany({ where: ownerWhere, select: { replyType: true } }),
      prisma.ndaRecord.findMany({ where: ownerWhere }),
      prisma.meeting.findMany({ where: relatedLeadOwnerWhere }),
      prisma.document.findMany({ where: relatedLeadOwnerWhere, select: { category: true }, distinct: ["category"] }),
      prisma.ioiRecord.findMany({ where: ownerWhere }),
      prisma.visitPlan.findMany({ where: ownerWhere }),
      prisma.dealStageRecord.findMany({ where: ownerWhere, select: { leadId: true, stage: true, status: true, amount: true } })
    ]);

  const atStage = (stage) => stageRows.filter((r) => r.stage === stage);
  const fieldVisitRows = atStage("FIELD_VISIT");
  const termSheetRows = atStage("TERM_SHEET");

  const uploadedCategories = new Set(documentCategories.map((d) => d.category));
  const coveredRequired = REQUIRED_DOCUMENT_LABELS.filter((label) => uploadedCategories.has(label)).length;
  const dataRoomCompletionRate = REQUIRED_DOCUMENT_LABELS.length
    ? Math.round((coveredRequired / REQUIRED_DOCUMENT_LABELS.length) * 1000) / 10
    : null;

  const nda = ndaMetrics(ndaRecords);
  const zoom = callMetrics(meetings);
  const ioi = ioiMetrics(ioiRecords);
  const visits = visitMetrics(visitPlans);
  const outreach = outreachMetrics(emailLeads);
  const dealAge = dealAgeMetrics(leads);
  const winRate = winRateMetrics(leads);
  const activeDeals = activeDealsMetrics(leads);
  const pipelineValue = pipelineValueMetrics({ ioiRecords, termSheetRecords: termSheetRows });

  const meetingCountByLead = new Map();
  for (const m of meetings) {
    if (!m.leadId) continue;
    meetingCountByLead.set(m.leadId, (meetingCountByLead.get(m.leadId) ?? 0) + 1);
  }
  const zoomCall2Ids = [...meetingCountByLead.entries()].filter(([, count]) => count >= 2).map(([leadId]) => leadId);

  const funnel = executiveFunnel({
    lead: leads.map((l) => l.id),
    outreach: leads.filter((l) => l.status !== "NEW").map((l) => l.id),
    nda: [...ndaRecords.map((r) => r.leadId), ...atStage("NDA").map((r) => r.leadId)],
    zoom: [...meetings.filter((m) => m.leadId).map((m) => m.leadId), ...atStage("ZOOM_CALL").map((r) => r.leadId)],
    dataRoom: atStage("DATA_ROOM").map((r) => r.leadId),
    ioiSigned: ioiRecords.filter((r) => r.status === "SIGNED").map((r) => r.leadId),
    zoomCall2: zoomCall2Ids,
    fieldVisit: [...visitPlans.filter((p) => p.status === "COMPLETED").map((p) => p.leadId), ...fieldVisitRows.map((r) => r.leadId)],
    termSheet: termSheetRows.map((r) => r.leadId)
  });

  const byKey = Object.fromEntries(funnel.map((s) => [s.key, s]));

  return {
    stats: {
      activeDeals,
      totalOutreach: { count: outreach.totalOutreach, responseRate: outreach.responseRate },
      ndaSigned: { count: nda.signed, sent: nda.sent, conversionPct: nda.signRate },
      ioiSigned: { count: ioi.signed, generated: ioi.generated, conversionPct: ioi.signRate },
      termSheets: {
        count: termSheetRows.length,
        conversionPct: leads.length ? Math.round((termSheetRows.length / leads.length) * 1000) / 10 : null
      },
      dealAge,
      pipelineValue
    },
    funnel,
    kpis: {
      totalOutreach: outreach.totalOutreach,
      responseRate: outreach.responseRate,
      ndaConversion: nda.signRate,
      zoomConversion: zoom.completed && meetings.length ? Math.round((zoom.completed / meetings.length) * 1000) / 10 : null,
      dataRoomCompletion: dataRoomCompletionRate,
      ioiConversion: ioi.signRate,
      zoomCall2Conversion: byKey.zoomCall2?.conversionFromPrevious ?? null,
      fieldVisitCompletion: visits.completionRate,
      termSheetConversion: byKey.termSheet?.conversionFromPrevious ?? null,
      pipelineValue: pipelineValue.total,
      avgDealAge: dealAge.avgDays,
      winRate: winRate.winRate
    },
    scope: doeName ? { doe: doeName } : null
  };
}
