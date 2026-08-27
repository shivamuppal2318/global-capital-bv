// Turns the same raw records the internal Relationships modules already
// track (NdaRecord, Meeting, Document, IoiRecord, VisitPlan,
// DealStageRecord) into a client-friendly, per-stage status — the
// "step by step (NDA, IOI, etc.)" progression shown on the client
// dashboard. Deliberately per-stage rather than "furthest stage reached"
// (as Universal Filters' lifecycle phase does): a client benefits from
// seeing every stage's own state, not just how far along the furthest one
// is — an NDA that's still pending is worth showing even after an IOI has
// gone out.
//
// Pure functions: plain records in, a plain {status, detail} out. No
// database, so every branch is testable without one.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : null);

export const PORTAL_STAGES = [
  { key: "nda", label: "NDA" },
  { key: "zoom", label: "Zoom Call" },
  { key: "dataRoom", label: "Data Room" },
  { key: "ioi", label: "IOI" },
  { key: "visitPlanning", label: "Visit Planning" },
  { key: "fieldVisit", label: "Field Visit" },
  { key: "termSheet", label: "Term Sheet" }
];

export function deriveNdaStage(nda) {
  if (!nda || !nda.sentAt) return { status: "not_started", detail: "Not yet sent" };
  if (nda.status === "SIGNED") return { status: "completed", detail: `Signed ${fmtDate(nda.signedAt)}` };
  if (nda.status === "DECLINED") return { status: "declined", detail: "Declined" };
  if (nda.status === "EXPIRED") return { status: "declined", detail: "Expired before signature" };
  return { status: "in_progress", detail: `Sent ${fmtDate(nda.sentAt)} — awaiting signature` };
}

export function deriveZoomStage(meetings) {
  if (!meetings.length) return { status: "not_started", detail: "No call scheduled yet" };
  const completed = meetings.filter((m) => m.status === "Completed");
  if (completed.length) {
    const latest = completed.reduce((a, b) => (new Date(b.startTime) > new Date(a.startTime) ? b : a));
    return { status: "completed", detail: `Last call ${fmtDate(latest.startTime)}` };
  }
  const scheduled = meetings.filter((m) => m.status === "Scheduled" && new Date(m.startTime) > new Date());
  if (scheduled.length) {
    const next = scheduled.reduce((a, b) => (new Date(b.startTime) < new Date(a.startTime) ? b : a));
    return { status: "in_progress", detail: `Scheduled for ${fmtDate(next.startTime)}` };
  }
  return { status: "not_started", detail: "No upcoming call" };
}

// Data Room isn't per-lead in this app — the document library is shared
// across every deal (see lib/requiredDocuments.js) — so this reports the
// shared checklist's completion rather than pretending there's a
// lead-specific document set. Honest about what it is rather than
// implying something lead-specific that doesn't exist.
export function deriveDataRoomStage({ receivedCount, totalRequired }) {
  if (!totalRequired) return { status: "not_started", detail: "No checklist configured" };
  if (receivedCount >= totalRequired) return { status: "completed", detail: "All requested documents received" };
  if (receivedCount > 0) return { status: "in_progress", detail: `${receivedCount} of ${totalRequired} requested documents received` };
  return { status: "not_started", detail: `0 of ${totalRequired} requested documents received` };
}

export function deriveIoiStage(ioi) {
  if (!ioi || !ioi.generatedAt) return { status: "not_started", detail: "Not yet issued" };
  if (ioi.status === "SIGNED") return { status: "completed", detail: `Signed ${fmtDate(ioi.signedAt)}` };
  if (ioi.status === "DECLINED") return { status: "declined", detail: "Declined" };
  if (ioi.status === "EXPIRED") return { status: "declined", detail: "Expired before signature" };
  if (ioi.sentAt) return { status: "in_progress", detail: `Sent ${fmtDate(ioi.sentAt)} — awaiting signature` };
  return { status: "in_progress", detail: "Generated — not yet sent" };
}

export function deriveVisitStage(visits) {
  if (!visits.length) return { status: "not_started", detail: "No visit planned yet" };
  const completed = visits.filter((v) => v.status === "COMPLETED");
  if (completed.length) {
    const latest = completed.reduce((a, b) => (new Date(b.completedAt ?? 0) > new Date(a.completedAt ?? 0) ? b : a));
    return { status: "completed", detail: `Last visit ${fmtDate(latest.completedAt)} — ${latest.location ?? "location on file"}` };
  }
  const upcoming = visits.filter((v) => ["PLANNED", "CONFIRMED"].includes(v.status));
  if (upcoming.length) {
    const next = upcoming.reduce((a, b) => (new Date(b.plannedFor ?? 0) < new Date(a.plannedFor ?? Infinity) ? b : a));
    return { status: "in_progress", detail: `Planned for ${fmtDate(next.plannedFor)}` };
  }
  return { status: "not_started", detail: "No upcoming visit" };
}

// Field Visit and Term Sheet share DealStageRecord — same shape, same
// derivation, just a different label per caller.
export function deriveDealStage(record) {
  if (!record) return { status: "not_started", detail: "Not started" };
  if (record.status === "COMPLETED") return { status: "completed", detail: record.completedAt ? `Completed ${fmtDate(record.completedAt)}` : "Completed" };
  if (record.status === "DECLINED") return { status: "declined", detail: "Declined" };
  if (record.status === "IN_PROGRESS") return { status: "in_progress", detail: "In progress" };
  if (record.status === "ON_HOLD") return { status: "in_progress", detail: "On hold" };
  return { status: "not_started", detail: "Not started" };
}

// Assembles the full stepper from the raw records a route fetched. Kept
// separate from the individual derive* functions so route code stays a
// single call, while each stage's logic is still unit-testable alone.
export function buildPortalStages({ nda, meetings, dataRoom, ioi, visits, fieldVisit, termSheet }) {
  const byKey = {
    nda: deriveNdaStage(nda),
    zoom: deriveZoomStage(meetings),
    dataRoom: deriveDataRoomStage(dataRoom),
    ioi: deriveIoiStage(ioi),
    visitPlanning: deriveVisitStage(visits),
    fieldVisit: deriveDealStage(fieldVisit),
    termSheet: deriveDealStage(termSheet)
  };
  return PORTAL_STAGES.map((s) => ({ ...s, ...byKey[s.key] }));
}
