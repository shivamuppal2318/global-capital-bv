// Backs the Universal Filters screen: 8 primary filter dimensions plus 6
// additional ones, all applied to the same CRM Lead population. Two of the
// fourteen (Lifecycle Phase, Next Action Due) aren't stored columns — they
// are derived from the same relationship tables the NDA/Zoom/Data
// Room/IOI/Visit Planning/Executive Dashboard modules already maintain, so
// the filter reflects live pipeline state rather than a field nobody
// remembers to update by hand.
//
// Pure functions only: plain data in, plain values out, no database — so
// every edge case is testable without a server.

import { parseApproxAmount } from "./executiveMetrics.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Ticket size bands -----------------------------------------------------

export const TICKET_SIZE_BANDS = [
  { key: "under_1m", label: "Under €1M", max: 1_000_000 },
  { key: "1m_5m", label: "€1M–€5M", max: 5_000_000 },
  { key: "5m_20m", label: "€5M–€20M", max: 20_000_000 },
  { key: "20m_plus", label: "€20M+", max: Infinity }
];

// capitalAsk arrives as free text ("EUR 3M", "TBC") — parseApproxAmount
// (shared with the Executive Dashboard's pipeline value) pulls a number out
// where one exists. Unparseable text is its own band rather than being
// dropped or silently grouped with a real number.
export function bucketTicketSize(capitalAsk) {
  const amount = parseApproxAmount(capitalAsk);
  if (amount === null) return "unspecified";
  const band = TICKET_SIZE_BANDS.find((b) => amount <= b.max);
  return band ? band.key : "20m_plus";
}

// --- Lifecycle phase ---------------------------------------------------

// Furthest stage a lead has reached, in funnel order — reuses the exact
// same "reached this stage" membership logic as the Executive Dashboard's
// funnel, so the two never disagree about what stage a lead is in.
// Zoom call 2 sits after IOI, not right after Zoom call 1 -- same
// ordering/reasoning as leadPipeline.js's own STAGES: the second call is
// the deeper due-diligence conversation that happens once a lead has
// actually committed to an IOI, not a generic "second meeting of any kind".
export const LIFECYCLE_STAGES = [
  { key: "lead", label: "Lead" },
  { key: "outreach", label: "Outreach" },
  { key: "nda", label: "NDA" },
  { key: "zoom", label: "Zoom call 1" },
  { key: "dataRoom", label: "Data room" },
  { key: "ioi", label: "IOI" },
  { key: "zoomCall2", label: "Zoom call 2" },
  { key: "fieldVisit", label: "Field visit" },
  { key: "termSheet", label: "Term sheet" }
];

// membership: { outreach: Set, nda: Set, zoom: Set, dataRoom: Set, ioi:
// Set, fieldVisit: Set, termSheet: Set } of lead ids at each stage. "lead"
// itself has no set — every lead qualifies for it by existing.
export function deriveLifecyclePhase(leadId, membership) {
  let furthest = LIFECYCLE_STAGES[0];
  for (const stage of LIFECYCLE_STAGES.slice(1)) {
    if (membership[stage.key]?.has(leadId)) furthest = stage;
  }
  return furthest;
}

// --- Next action due -----------------------------------------------------

// The nearest concrete calendar commitment tied to a lead, pulled from
// whichever module actually tracks one — a follow-up date logged on a
// Zoom call, an upcoming (non-completed, non-cancelled) site visit, or an
// NDA's expiry. Not a separate manually-typed field: a duplicate date
// nobody kept in sync with the real one would be worse than no field.
export function deriveNextActionDue(dates) {
  const future = dates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (!future.length) return null;
  return new Date(Math.min(...future.map((d) => d.getTime())));
}

export const DUE_WINDOWS = [
  { key: "overdue", label: "Overdue" },
  { key: "due_7d", label: "Due within 7 days" },
  { key: "due_30d", label: "Due within 30 days" },
  { key: "none", label: "No action due" }
];

export function bucketDueWindow(dueDate, now = new Date()) {
  if (!dueDate) return "none";
  const diffDays = (dueDate.getTime() - now.getTime()) / DAY_MS;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "due_7d";
  if (diffDays <= 30) return "due_30d";
  return "none";
}

// --- Filter matching -------------------------------------------------------

// One lead "row" (a Lead plus its two derived fields) against the filter
// criteria the screen is currently set to. Every criterion is optional —
// an unset filter matches everything, which is what lets 14 independent
// dimensions compose into one query without the caller building up a
// conditional WHERE clause by hand.
export function matchesFilters(row, filters = {}) {
  const f = filters;

  if (f.q) {
    const needle = f.q.toLowerCase();
    const haystack = `${row.name} ${row.company}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  // Exact match on a single picked lead -- the Universal Filters screen's
  // "Lead" filter card, a real dropdown of every lead rather than the
  // free-text q above (still supported for anything else matching by
  // typed name/company).
  if (f.leadId && row.id !== f.leadId) return false;
  if (f.channelPartner && row.channelPartner !== f.channelPartner) return false;
  if (f.industry && row.industry !== f.industry) return false;
  if (f.geography && row.territory !== f.geography) return false;
  if (f.temperature && row.temperature !== f.temperature) return false;
  if (f.teamLeader && row.teamLeader !== f.teamLeader) return false;
  if (f.manager && row.manager !== f.manager) return false;
  if (f.leadSource && row.leadSource !== f.leadSource) return false;
  if (f.status && row.status !== f.status) return false;
  if (f.lifecyclePhase && row.lifecyclePhase !== f.lifecyclePhase) return false;
  if (f.ticketSizeBand && row.ticketSizeBand !== f.ticketSizeBand) return false;
  if (f.dueWindow && row.dueWindow !== f.dueWindow) return false;

  if (f.doe && row.doe !== f.doe) return false;
  if (f.timeFrom && row.createdAt < new Date(f.timeFrom)) return false;
  if (f.timeTo && row.createdAt > new Date(f.timeTo)) return false;

  return true;
}
