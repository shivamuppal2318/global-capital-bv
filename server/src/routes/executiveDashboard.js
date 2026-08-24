import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { REQUIRED_DOCUMENT_LABELS } from "../lib/requiredDocuments.js";
import { ndaMetrics, callMetrics, ioiMetrics, visitMetrics } from "../lib/relationshipMetrics.js";
import {
  executiveFunnel,
  outreachMetrics,
  dealAgeMetrics,
  winRateMetrics,
  activeDealsMetrics,
  pipelineValueMetrics
} from "../lib/executiveMetrics.js";

export const executiveDashboardRouter = Router();

// One call, everything the landing dashboard needs. Assembled server-side
// rather than making the frontend fetch and cross-reference six endpoints,
// since the funnel and the KPI table both need the same underlying rows.
executiveDashboardRouter.get("/", asyncHandler(async (_req, res) => {
  const [leads, emailLeads, ndaRecords, meetings, documentCategories, ioiRecords, visitPlans, stageRows] =
    await Promise.all([
      prisma.lead.findMany({ select: { id: true, status: true, createdAt: true } }),
      prisma.emailLead.findMany({ select: { replyType: true } }),
      prisma.ndaRecord.findMany(),
      prisma.meeting.findMany(),
      prisma.document.findMany({ select: { category: true }, distinct: ["category"] }),
      prisma.ioiRecord.findMany(),
      prisma.visitPlan.findMany(),
      prisma.dealStageRecord.findMany({ select: { leadId: true, stage: true, status: true, amount: true } })
    ]);

  const atStage = (stage) => stageRows.filter((r) => r.stage === stage);
  const fieldVisitRows = atStage("FIELD_VISIT");
  const termSheetRows = atStage("TERM_SHEET");

  // Required-documents completion: how many of the fixed checklist
  // categories (see lib/requiredDocuments.js) have at least one uploaded
  // document. Deliberately a plain category-name match, the same rule the
  // Data Room screen itself uses for its "covered" badge — no AI call on
  // every dashboard load.
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

  // The funnel's Outreach/NDA/Zoom/Data-room/IOI stages are CRM leads that
  // reached that point — a lead counts as "reached NDA" whether the record
  // lives in the new NdaRecord table or (for anyone predating that move)
  // the shared DealStageRecord. "Outreach" here means a CRM lead that has
  // moved past NEW, i.e. someone has actually engaged with it; it is
  // deliberately not the same population as the cold-email EmailLead list
  // above, which has no link back to a CRM Lead record.
  const funnel = executiveFunnel({
    lead: leads.map((l) => l.id),
    outreach: leads.filter((l) => l.status !== "NEW").map((l) => l.id),
    nda: [...ndaRecords.map((r) => r.leadId), ...atStage("NDA").map((r) => r.leadId)],
    zoom: [...meetings.filter((m) => m.leadId).map((m) => m.leadId), ...atStage("ZOOM_CALL").map((r) => r.leadId)],
    dataRoom: atStage("DATA_ROOM").map((r) => r.leadId),
    ioi: [...ioiRecords.map((r) => r.leadId), ...atStage("IOI").map((r) => r.leadId)],
    fieldVisit: [...visitPlans.filter((p) => p.status === "COMPLETED").map((p) => p.leadId), ...fieldVisitRows.map((r) => r.leadId)],
    termSheet: termSheetRows.map((r) => r.leadId)
  });

  const byKey = Object.fromEntries(funnel.map((s) => [s.key, s]));

  res.json({
    generatedAt: new Date().toISOString(),
    stats: {
      activeDeals,
      // "21, 8.5%" on the spec's Term Sheets card: 21 is the raw count,
      // 8.5% is that count as a share of every lead ever created — the
      // same denominator activeDeals and winRate use.
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
      fieldVisitCompletion: visits.completionRate,
      termSheetConversion: byKey.termSheet?.conversionFromPrevious ?? null,
      pipelineValue: pipelineValue.total,
      avgDealAge: dealAge.avgDays,
      winRate: winRate.winRate
    }
  });
}));
