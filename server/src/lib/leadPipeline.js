import { prisma } from "../db.js";

// A single CRM lead's real journey across the full deal lifecycle — a
// per-record complement to Executive Dashboard's company-wide Funnel
// Health chart, not a duplicate of it: that one counts how many distinct
// leads reached each stage across the whole pipeline, this one shows
// exactly where ONE lead stands right now.
//
// Every stage after Outreach is a real, direct relation off this Lead
// (NdaRecord/Meeting/DealStageRecord/IoiRecord all carry leadId) — nothing
// here is inferred or matched by name. Outreach is the one exception: cold
// email lives in a separate domain (EmailLead) with no relation back to
// this CRM Lead, so it's approximated from the lead's own status instead
// of left out — status past "NEW" is real evidence contact was made, even
// though it can't say exactly when the first email went out.
export const STAGES = ["OUTREACH", "NDA", "ZOOM_CALL", "DATA_ROOM", "IOI", "FIELD_VISIT", "TERM_SHEET"];
export const STAGE_LABELS = {
  OUTREACH: "Outreach",
  NDA: "NDA",
  ZOOM_CALL: "Zoom Call",
  DATA_ROOM: "Data Room",
  IOI: "IOI",
  FIELD_VISIT: "Field Visit",
  TERM_SHEET: "Term Sheet"
};

export async function computeLeadPipeline(leadId) {
  const [lead, nda, meetings, dataRoomRecord, ioi, fieldVisitRecord, termSheetRecord] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } }),
    prisma.ndaRecord.findUnique({ where: { leadId } }),
    prisma.meeting.findMany({ where: { leadId }, orderBy: { startTime: "desc" } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "DATA_ROOM" } } }),
    prisma.ioiRecord.findUnique({ where: { leadId } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "FIELD_VISIT" } } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "TERM_SHEET" } } })
  ]);

  if (!lead) return null;

  const outreach = { status: lead.status === "NEW" ? "not_started" : "done", detail: lead.status === "NEW" ? "Not yet contacted" : "Contact made" };

  const nda_ = (() => {
    if (!nda) return { status: "not_started", detail: "No NDA record" };
    if (nda.status === "SIGNED") return { status: "done", detail: "Signed" };
    if (nda.status === "DECLINED" || nda.status === "EXPIRED") return { status: "blocked", detail: nda.status === "DECLINED" ? "Declined" : "Expired" };
    return { status: "in_progress", detail: nda.status.replace("_", " ") };
  })();

  const zoomCall = (() => {
    if (meetings.length === 0) return { status: "not_started", detail: "No calls scheduled" };
    const hasHappened = meetings.some((m) => new Date(m.startTime).getTime() < Date.now());
    return hasHappened
      ? { status: "done", detail: `${meetings.length} call(s), most recent held` }
      : { status: "in_progress", detail: `${meetings.length} call(s) scheduled` };
  })();

  const stageRecordSummary = (record) => {
    if (!record) return { status: "not_started", detail: "Not started" };
    if (record.status === "COMPLETED") return { status: "done", detail: "Completed" };
    if (record.status === "DECLINED") return { status: "blocked", detail: "Declined" };
    return { status: "in_progress", detail: record.status.replace("_", " ").toLowerCase() };
  };

  const ioi_ = (() => {
    if (!ioi) return { status: "not_started", detail: "No IOI record" };
    if (ioi.status === "SIGNED") return { status: "done", detail: "Signed" };
    if (ioi.status === "DECLINED" || ioi.status === "EXPIRED") return { status: "blocked", detail: ioi.status === "DECLINED" ? "Declined" : "Expired" };
    return { status: "in_progress", detail: ioi.status.toLowerCase() };
  })();

  const summaries = {
    OUTREACH: outreach,
    NDA: nda_,
    ZOOM_CALL: zoomCall,
    DATA_ROOM: stageRecordSummary(dataRoomRecord),
    IOI: ioi_,
    FIELD_VISIT: stageRecordSummary(fieldVisitRecord),
    TERM_SHEET: stageRecordSummary(termSheetRecord)
  };

  return STAGES.map((stage) => ({ id: stage, label: STAGE_LABELS[stage], ...summaries[stage] }));
}

// The company-wide complement to computeLeadPipeline: not one lead's
// stage-by-stage detail, but how many of ALL leads have reached each stage
// at least once. "Reached" means anything other than not_started —
// in_progress, done, and blocked (e.g. an NDA that was sent then declined)
// all count, since the lead genuinely got to that stage even if it didn't
// go well there. Built by reusing computeLeadPipeline per lead rather than
// a second, separately-written query, so this can never drift out of sync
// with what the per-lead Deal Journey popup shows for the same lead.
export async function computePipelineSummary() {
  const leads = await prisma.lead.findMany({ select: { id: true, name: true } });
  const pipelines = await Promise.all(leads.map((l) => computeLeadPipeline(l.id)));

  return STAGES.map((stage, idx) => {
    // Which leads, by name — not just how many — so the CRM Workspace
    // screen can show who actually reached each stage (mirrors how the
    // Outreach/NDA-signed lists elsewhere name the people involved) instead
    // of a bare count.
    const names = leads.filter((_, leadIdx) => pipelines[leadIdx][idx].status !== "not_started").map((l) => l.name);
    return {
      id: stage,
      label: STAGE_LABELS[stage],
      reached: names.length,
      total: leads.length,
      names
    };
  });
}

// A Kanban view of the SAME per-lead pipeline computeLeadPipeline already
// tracks — one column per stage, one card per lead, placed in whichever
// stage is furthest along for that lead (the highest-index stage that
// isn't "not_started"). Deliberately not the same shape as
// computePipelineSummary: that one is cumulative ("reached this stage at
// least once", so one lead counts toward several stages at once); a Kanban
// board needs each deal to live in exactly one column, its current stage,
// the way a real pipeline board works.
export async function computeDealBoard() {
  const leads = await prisma.lead.findMany({ select: { id: true, name: true, company: true, capitalAsk: true, updatedAt: true } });
  const pipelines = await Promise.all(leads.map((l) => computeLeadPipeline(l.id)));

  const board = STAGES.map((stage) => ({ id: stage, label: STAGE_LABELS[stage], deals: [] }));

  leads.forEach((lead, leadIdx) => {
    const pipeline = pipelines[leadIdx];
    let currentIdx = 0;
    pipeline.forEach((stageSummary, idx) => {
      if (stageSummary.status !== "not_started") currentIdx = idx;
    });

    board[currentIdx].deals.push({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      capitalAsk: lead.capitalAsk,
      updatedAt: lead.updatedAt,
      stageStatus: pipeline[currentIdx].status,
      stageDetail: pipeline[currentIdx].detail
    });
  });

  return board;
}
