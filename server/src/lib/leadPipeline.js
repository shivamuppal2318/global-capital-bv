import { prisma } from "../db.js";
import { deriveZoomStage2 } from "./clientPortalStages.js";
import { REQUIRED_DOCUMENT_LABELS } from "./requiredDocuments.js";

// A single CRM lead's real journey across the full deal lifecycle — a
// per-record complement to Executive Dashboard's company-wide Funnel
// Health chart, not a duplicate of it: that one counts how many distinct
// leads reached each stage across the whole pipeline, this one shows
// exactly where ONE lead stands right now.
//
// Every stage after Outreach is a real, direct relation off this Lead
// (NdaRecord/Meeting/DealStageRecord/IoiRecord all carry leadId) — nothing
// here is inferred or matched by name. Outreach is the one exception: cold
// email lives in a separate domain (EmailLead), and the two have no
// formal foreign-key relation in either direction — a Lead created FROM a
// converted EmailLead reply, and an EmailLead created FROM a Lead via CRM
// Workspace's "Add to List", both just copy the same email address across
// rather than pointing at each other's row. Matched by that shared email
// address instead: real evidence a cold email actually went out for this
// specific lead, not the earlier approximation (any status change past
// "NEW", cold email or not — confirmed live: CSV-imported leads that had
// their status touched for unrelated reasons showed as "contacted" here
// despite never having been emailed at all).
// Zoom Call 2 sits after IOI, not right after Zoom Call (1) — same
// ordering/reasoning as the client portal's own stepper (see
// clientPortalStages.js's PORTAL_STAGES comment): the second call is the
// deeper due-diligence conversation that happens once a lead has actually
// committed to an IOI, not a generic "second meeting of any kind".
export const STAGES = ["OUTREACH", "INTERESTED", "NDA", "ZOOM_CALL", "DATA_ROOM", "IOI", "ZOOM_CALL_2", "FIELD_VISIT", "TERM_SHEET"];
export const STAGE_LABELS = {
  OUTREACH: "Outreach",
  INTERESTED: "Interested",
  NDA: "NDA",
  ZOOM_CALL: "Zoom Call",
  DATA_ROOM: "Data Room",
  IOI: "IOI",
  ZOOM_CALL_2: "Zoom Call 2",
  FIELD_VISIT: "Field Visit",
  TERM_SHEET: "Term Sheet"
};

// Interested still has no real relation to check (unlike Outreach's real
// EmailActivityLog match below, there's no separate "marked interested"
// record — a reply just flips this Lead's own status) so it stays a
// status-based approximation: status INTERESTED or anything further along
// the positive funnel counts as this stage being reached, whether it got
// there via the automatic
// reply-classified-INTERESTED conversion (see lib/emailLeadConversion.js)
// or a rep manually setting it. LOST is deliberately excluded — a lead
// marked lost may never have shown real interest at all, and this is a
// live snapshot of current status, not a history of every status it ever
// passed through.
const INTEREST_REACHED_STATUSES = new Set(["INTERESTED", "QUALIFIED", "NEGOTIATION", "CONVERTED"]);

// Same two kinds routes/emailCampaigns.js's own SEND_KINDS and
// lib/doeScorecard.js's own SEND_KINDS mean by "a real send" — a completed
// provider send, not just a lead being added to a campaign
// (BULK_INTRO_SENT) which never actually goes out on its own.
const SEND_KINDS = ["BRANCH_EMAIL_SENT", "CAMPAIGN_BLAST_SENT"];

export async function computeLeadPipeline(leadId) {
  const [lead, nda, meetings, dataRoomDocs, ioi, fieldVisitRecord, termSheetRecord] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, email: true } }),
    prisma.ndaRecord.findUnique({ where: { leadId } }),
    prisma.meeting.findMany({ where: { leadId }, orderBy: { startTime: "desc" } }),
    // Real received-document count against the required checklist (same
    // categories/logic as documents.js's own /kpis route) — not the
    // DealStageRecord for this stage, which has no real staff edit screen
    // (DATA_ROOM isn't in stageConfig.js's MODULE_TO_STAGE) and can only
    // ever sit at NOT_STARTED or IN_PROGRESS via the client portal's
    // upload side-effect, never reflecting how much has actually come in.
    prisma.document.findMany({ where: { leadId, category: { in: REQUIRED_DOCUMENT_LABELS } }, select: { category: true } }),
    prisma.ioiRecord.findUnique({ where: { leadId } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "FIELD_VISIT" } } }),
    prisma.dealStageRecord.findUnique({ where: { leadId_stage: { leadId, stage: "TERM_SHEET" } } })
  ]);

  if (!lead) return null;

  const realSendCount = lead.email
    ? await prisma.emailActivityLog.count({
        where: { kind: { in: SEND_KINDS }, lead: { email: { equals: lead.email, mode: "insensitive" } } }
      })
    : 0;
  const outreach = {
    status: realSendCount > 0 ? "done" : "not_started",
    detail: realSendCount > 0 ? `${realSendCount} real cold email(s) sent` : "No cold outreach email sent yet"
  };

  const interested = {
    status: INTEREST_REACHED_STATUSES.has(lead.status) ? "done" : "not_started",
    detail: INTEREST_REACHED_STATUSES.has(lead.status) ? "Replied interested" : "No interested reply yet"
  };

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

  // A lead only counts as meaningfully "in" Data Room once more than half
  // the required checklist has actually come in — a couple of stray
  // uploads out of ten shouldn't read the same as real diligence
  // progress. All required categories in = done (same "received, not
  // necessarily staff-verified yet" bar the client portal's own
  // deriveDataRoomStage already uses, for consistency).
  const dataRoom = (() => {
    const requested = REQUIRED_DOCUMENT_LABELS.length;
    const received = new Set(dataRoomDocs.map((d) => d.category)).size;
    const percent = requested > 0 ? Math.round((received / requested) * 100) : 0;
    const detail = `${received} of ${requested} required document(s) received (${percent}%)`;
    if (received >= requested) return { status: "done", detail };
    if (percent > 50) return { status: "in_progress", detail };
    return { status: "not_started", detail };
  })();

  const ioi_ = (() => {
    if (!ioi) return { status: "not_started", detail: "No IOI record" };
    if (ioi.status === "SIGNED") return { status: "done", detail: "Signed" };
    if (ioi.status === "DECLINED" || ioi.status === "EXPIRED") return { status: "blocked", detail: ioi.status === "DECLINED" ? "Declined" : "Expired" };
    return { status: "in_progress", detail: ioi.status.toLowerCase() };
  })();

  // Reuses clientPortalStages.js's deriveZoomStage2 as-is (already tested,
  // already the source of truth for "which meeting counts as the second
  // call" — chronologically the 2nd meeting, regardless of how the first
  // one went) rather than a second, separately-maintained implementation.
  // Its vocabulary ("completed") is mapped onto this file's own
  // ("done") — everything else it returns (not_started/in_progress) is
  // already identical.
  const zoomCall2 = (() => {
    const { status, detail } = deriveZoomStage2(meetings);
    return { status: status === "completed" ? "done" : status, detail };
  })();

  const summaries = {
    OUTREACH: outreach,
    INTERESTED: interested,
    NDA: nda_,
    ZOOM_CALL: zoomCall,
    DATA_ROOM: dataRoom,
    IOI: ioi_,
    ZOOM_CALL_2: zoomCall2,
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
export async function computePipelineSummary(where = {}) {
  const leads = await prisma.lead.findMany({ where, select: { id: true, name: true } });
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
//
// Outreach is the one deliberate exception to "exactly one column": every
// other stage describes a gate a deal is currently AT (an unsigned NDA, a
// scheduled call) and stops describing it once resolved or superseded, but
// Outreach describes something that either happened or didn't — a lead who
// replied "interested" and moved on was still, undeniably, sent a real
// cold email. Hiding it from Outreach the moment it progresses would make
// the column read as "leads currently stuck at first contact" instead of
// what it's actually meant to answer here: "who did we genuinely email via
// Email Automation" (confirmed live: a rep expected a lead that had
// replied and moved to Interested to still show up in Outreach too, not
// disappear from it). So it's added to board[OUTREACH] whenever real send
// evidence exists, independent of — and in addition to — that lead's
// single current-stage card below.
export async function computeDealBoard(where = {}) {
  const leads = await prisma.lead.findMany({ where, select: { id: true, name: true, company: true, capitalAsk: true, updatedAt: true } });
  const pipelines = await Promise.all(leads.map((l) => computeLeadPipeline(l.id)));

  const board = STAGES.map((stage) => ({ id: stage, label: STAGE_LABELS[stage], deals: [] }));

  leads.forEach((lead, leadIdx) => {
    const pipeline = pipelines[leadIdx];

    // A lead nothing has actually happened for yet (still status NEW, so
    // even Outreach itself reads not_started) doesn't belong on a board
    // about deals actively moving through stages — currentIdx below
    // defaults to 0 when nothing has been reached, which used to dump
    // every freshly added/imported lead straight into the Outreach column
    // whether or not real outreach (or anything else) had actually
    // happened for them. Confirmed live: a batch of CSV-imported leads,
    // status NEW, never emailed, was filling up Outreach for exactly this
    // reason. They still show up in New Enquiries and everywhere else —
    // only this board, which is about current stage progress, excludes them.
    const everReached = pipeline.some((stageSummary) => stageSummary.status !== "not_started");
    if (!everReached) return;

    const dealCard = (idx) => ({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      capitalAsk: lead.capitalAsk,
      updatedAt: lead.updatedAt,
      stageStatus: pipeline[idx].status,
      stageDetail: pipeline[idx].detail
    });

    // See the Outreach exception in this function's own comment above —
    // real send evidence keeps a lead's card in Outreach even after it
    // moves further along, so this is added independent of currentIdx
    // below rather than competing with it for the one slot a lead gets in
    // every other column.
    const outreachIdx = STAGES.indexOf("OUTREACH");
    if (pipeline[outreachIdx].status === "done") {
      board[outreachIdx].deals.push(dealCard(outreachIdx));
    }

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

    // currentIdx === outreachIdx means Outreach is the only thing this
    // lead ever reached — already added above, don't double it up.
    if (currentIdx === outreachIdx) return;

    board[currentIdx].deals.push(dealCard(currentIdx));
  });

  return board;
}
