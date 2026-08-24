// Pure metric functions for the Executive Dashboard — the CEO-level view
// across the whole pipeline, not just one Relationships module. Same shape
// as relationshipMetrics.js: plain data in, plain numbers out, no database,
// so every edge case is testable without a server.

const DAY_MS = 24 * 60 * 60 * 1000;

function round(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// --- Deal funnel -----------------------------------------------------------

// Lead -> Outreach -> NDA -> Zoom call -> Data room -> IOI -> Field visit ->
// Term sheet. Each stage is a list of ids at that point in the pipeline;
// only distinct ids are counted, so a lead appearing twice in one stage's
// source data cannot inflate it.
export function executiveFunnel({
  lead = [],
  outreach = [],
  nda = [],
  zoom = [],
  dataRoom = [],
  ioi = [],
  fieldVisit = [],
  termSheet = []
} = {}) {
  const stages = [
    { key: "lead", label: "Lead", ids: lead },
    { key: "outreach", label: "Outreach", ids: outreach },
    { key: "nda", label: "NDA", ids: nda },
    { key: "zoom", label: "Zoom call", ids: zoom },
    { key: "dataRoom", label: "Data room", ids: dataRoom },
    { key: "ioi", label: "IOI", ids: ioi },
    { key: "fieldVisit", label: "Field visit", ids: fieldVisit },
    { key: "termSheet", label: "Term sheet", ids: termSheet }
  ];

  const counts = stages.map((s) => ({ ...s, count: new Set(s.ids).size }));
  const top = counts[0].count;

  return counts.map((s, i) => {
    const prev = i === 0 ? null : counts[i - 1].count;
    return {
      key: s.key,
      label: s.label,
      count: s.count,
      // Share of the top of the funnel — what the funnel graphic is drawn from.
      shareOfTop: top ? round((s.count / top) * 100) : null,
      // Conversion from the immediately preceding stage. Null at the top
      // (nothing precedes it) and when the previous stage is empty, rather
      // than a misleading 0% or a divide-by-zero.
      conversionFromPrevious: prev === null ? null : prev ? round((s.count / prev) * 100) : null,
      dropOff: prev === null ? null : Math.max(0, prev - s.count)
    };
  });
}

// --- Cold outreach -----------------------------------------------------

// Distinct from the CRM Lead funnel above: EmailLead is the cold-email
// prospect list, a separate table with no link back to a CRM Lead record.
// Reported as its own reach number, not folded into the funnel's Lead
// count — the two are different populations.
export function outreachMetrics(emailLeads) {
  const responded = emailLeads.filter((l) => l.replyType && l.replyType !== "NO_REPLY");
  return {
    totalOutreach: emailLeads.length,
    responded: responded.length,
    responseRate: emailLeads.length ? round((responded.length / emailLeads.length) * 100) : null
  };
}

// --- Deal age ------------------------------------------------------------

// Average age, in days, of leads still open right now — how long deals
// have been sitting in the pipeline. Closed leads (won or lost) are
// excluded: their age describes something that already happened, not the
// health of the current pipeline.
export function dealAgeMetrics(leads) {
  const active = leads.filter((l) => !["CONVERTED", "LOST"].includes(l.status));
  const now = Date.now();
  const avgDays = active.length
    ? round(active.reduce((sum, l) => sum + (now - new Date(l.createdAt)) / DAY_MS, 0) / active.length)
    : null;
  return { activeCount: active.length, avgDays };
}

// --- Win rate --------------------------------------------------------------

// Share of CLOSED leads (won or lost) that were won. Open leads are
// excluded from the denominator entirely — a deal still in play has
// neither won nor lost yet, and counting it as a loss would understate the
// rate for as long as it stays open.
export function winRateMetrics(leads) {
  const won = leads.filter((l) => l.status === "CONVERTED").length;
  const lost = leads.filter((l) => l.status === "LOST").length;
  const closed = won + lost;
  return { won, lost, closed, winRate: closed ? round((won / closed) * 100) : null };
}

// --- Active deals, with a real (not fabricated) trend ---------------------

// "+18%"-style trend badges are only honest if backed by real history. The
// only history available without a snapshot table is each lead's
// createdAt, so the trend compares leads opened in the last 30 days against
// the 30 days before that — a real, if narrow, measure of pipeline growth.
export function activeDealsMetrics(leads) {
  const active = leads.filter((l) => !["CONVERTED", "LOST"].includes(l.status));
  const now = Date.now();
  const recentWindow = active.filter((l) => now - new Date(l.createdAt) <= 30 * DAY_MS).length;
  const priorWindow = active.filter((l) => {
    const age = now - new Date(l.createdAt);
    return age > 30 * DAY_MS && age <= 60 * DAY_MS;
  }).length;

  return {
    count: active.length,
    // Null (not 0%) when there is nothing in the prior window to compare
    // against — "+infinity%" would be a meaningless badge.
    trendPct: priorWindow ? round(((recentWindow - priorWindow) / priorWindow) * 100) : null,
    recentWindow,
    priorWindow
  };
}

// --- Pipeline value --------------------------------------------------------

// Term sheet amounts are free text ("EUR 2-4M", "TBC") because that is how
// they actually arrive from the deal team. This pulls a number out where
// one is genuinely recoverable and leaves the rest out of the total rather
// than guessing at unparseable text. A range like "2-4M" contributes its
// midpoint.
const UNIT_MULTIPLIER = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };

function toAmount(num, unit) {
  return Number(num) * (UNIT_MULTIPLIER[(unit || "").toUpperCase()] ?? 1);
}

// Tries a "2-4M" / "EUR 1.5M - 2.5M" range first: the unit usually sits
// only on the second number, and applying it to the first as well is what
// makes "2-4M" mean 2,000,000-4,000,000 rather than 2 and 4,000,000. Falls
// back to the first single figure found. Deliberately does not sum every
// number in the string — free text can contain unrelated digits (a date, a
// reference number), and summing those would fabricate an amount.
export function parseApproxAmount(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/,/g, "");

  const range = cleaned.match(/(\d+(?:\.\d+)?)\s*(K|M|B)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(K|M|B)/i);
  if (range) {
    const [, num1, unit1, num2, unit2] = range;
    const lo = toAmount(num1, unit1 || unit2);
    const hi = toAmount(num2, unit2);
    return (lo + hi) / 2;
  }

  const single = cleaned.match(/(\d+(?:\.\d+)?)\s*(K|M|B)?/i);
  return single ? toAmount(single[1], single[2]) : null;
}

// Sums IOI values (already numeric) and parsed term-sheet amounts.
// "Qualified" excludes anything declined on either side — a declined IOI
// or a dead term sheet is not live pipeline value.
export function pipelineValueMetrics({ ioiRecords = [], termSheetRecords = [] } = {}) {
  const qualifiedIoi = ioiRecords.filter(
    (r) => typeof r.value === "number" && r.value > 0 && !["DECLINED", "EXPIRED"].includes(r.status)
  );
  const ioiTotal = qualifiedIoi.reduce((sum, r) => sum + r.value, 0);

  const liveTermSheets = termSheetRecords.filter((r) => r.status !== "DECLINED");
  const parsedTermSheetValues = liveTermSheets.map((r) => parseApproxAmount(r.amount)).filter((v) => typeof v === "number" && v > 0);
  const termSheetTotal = parsedTermSheetValues.reduce((sum, v) => sum + v, 0);

  return {
    total: round(ioiTotal + termSheetTotal, 2),
    ioiTotal: round(ioiTotal, 2),
    ioiCount: qualifiedIoi.length,
    termSheetTotal: round(termSheetTotal, 2),
    termSheetCount: parsedTermSheetValues.length,
    // Live term sheets that exist but whose free-text amount could not be
    // parsed — surfaced so the total's completeness is visible, not hidden.
    termSheetUnparsed: liveTermSheets.length - parsedTermSheetValues.length
  };
}
