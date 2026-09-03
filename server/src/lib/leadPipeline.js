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

// A dated, chronological event list for one lead -- distinct from
// computeLeadPipeline above, which collapses each stage to a single
// current status and drops dates entirely. This keeps every real
// timestamped record instead, across every model that actually carries
// leadId (all of DealStageRecord's rows this time, not just the 3
// computeLeadPipeline reads, plus VisitPlan and Document, neither of
// which that function touches at all) -- nothing here is fabricated, an
// event only appears if its underlying date field is actually set.
export async function computeLeadTimeline(leadId) {
  const [lead, nda, meetings, dealStages, ioi, visits, documents, activity] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { createdAt: true, zoomInfoEnrichedAt: true } }),
    prisma.ndaRecord.findUnique({ where: { leadId } }),
    prisma.meeting.findMany({ where: { leadId } }),
    prisma.dealStageRecord.findMany({ where: { leadId } }),
    prisma.ioiRecord.findUnique({ where: { leadId } }),
    prisma.visitPlan.findMany({ where: { leadId } }),
    prisma.document.findMany({ where: { leadId } }),
    prisma.leadActivityLog.findMany({ where: { leadId } })
  ]);

  if (!lead) return null;

  const events = [{ at: lead.createdAt, title: "Lead created", detail: "Added to CRM Workspace" }];

  if (lead.zoomInfoEnrichedAt) events.push({ at: lead.zoomInfoEnrichedAt, title: "Enriched via ZoomInfo", detail: "Company and/or contact data auto-filled" });

  if (nda?.sentAt) events.push({ at: nda.sentAt, title: "NDA sent", detail: nda.owner ? `By ${nda.owner}` : "" });
  if (nda?.signedAt) events.push({ at: nda.signedAt, title: "NDA signed", detail: nda.signerName ? `By ${nda.signerName}` : "" });

  for (const m of meetings) {
    const held = new Date(m.startTime).getTime() < Date.now();
    events.push({ at: m.startTime, title: held ? "Zoom call held" : "Zoom call scheduled", detail: m.topic ?? "" });
  }

  for (const stage of dealStages) {
    const label = STAGE_LABELS[stage.stage] ?? stage.stage;
    if (stage.scheduledAt) events.push({ at: stage.scheduledAt, title: `${label} scheduled`, detail: stage.notes ?? "" });
    if (stage.completedAt) events.push({ at: stage.completedAt, title: `${label} completed`, detail: stage.notes ?? "" });
  }

  if (ioi?.sentAt) events.push({ at: ioi.sentAt, title: "IOI sent", detail: ioi.owner ? `By ${ioi.owner}` : "" });
  if (ioi?.signedAt) events.push({ at: ioi.signedAt, title: "IOI signed", detail: "" });

  for (const v of visits) {
    if (v.plannedFor) events.push({ at: v.plannedFor, title: "Visit planned", detail: v.location ?? "" });
    if (v.completedAt) events.push({ at: v.completedAt, title: "Visit completed", detail: v.location ?? "" });
  }

  for (const d of documents) events.push({ at: d.createdAt, title: `Document uploaded: ${d.originalName}`, detail: d.category });

  for (const a of activity) events.push({ at: a.createdAt, title: a.title, detail: a.detail });

  return events.sort((a, b) => new Date(b.at) - new Date(a.at));
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
    // The deal's real current column is its earliest unresolved gate
    // (in_progress or blocked) — e.g. an NDA that's been sent but not
    // signed yet — not just whichever stage was touched most recently.
    // Real deals often have parallel activity (a Zoom call can happen, or
    // Data Room docs get requested, before the NDA is actually countersigned),
    // and "furthest touched" was placing the card past a stage that hadn't
    // actually been resolved — an unsigned NDA would vanish from the NDA
    // column the moment ANY later stage had activity, even though the deal
    // is really still stuck at NDA. Only when nothing is currently
    // unresolved (every reached stage is "done") does the card fall back
    // to the furthest one reached, same as before.
    let currentIdx = 0;
    let firstUnresolvedIdx = null;
    pipeline.forEach((stageSummary, idx) => {
      if (stageSummary.status !== "not_started") currentIdx = idx;
      if (firstUnresolvedIdx === null && (stageSummary.status === "in_progress" || stageSummary.status === "blocked")) {
        firstUnresolvedIdx = idx;
      }
    });
    if (firstUnresolvedIdx !== null) currentIdx = firstUnresolvedIdx;

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
