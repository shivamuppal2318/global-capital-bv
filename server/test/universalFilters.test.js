import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketTicketSize,
  deriveLifecyclePhase,
  deriveNextActionDue,
  bucketDueWindow,
  matchesFilters,
  LIFECYCLE_STAGES
} from "../src/lib/universalFilters.js";

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// --- bucketTicketSize --------------------------------------------------

test("bucketTicketSize: bands a parsed amount into the right range", () => {
  assert.equal(bucketTicketSize("EUR 600K"), "under_1m");
  assert.equal(bucketTicketSize("EUR 3M"), "1m_5m");
  assert.equal(bucketTicketSize("EUR 12M"), "5m_20m");
  assert.equal(bucketTicketSize("EUR 45M"), "20m_plus");
});

test("bucketTicketSize: an amount exactly on a band's ceiling falls in that (lower) band", () => {
  assert.equal(bucketTicketSize("EUR 1M"), "under_1m");
  assert.equal(bucketTicketSize("EUR 5M"), "1m_5m");
});

test("bucketTicketSize: unparseable text is its own band, not dropped or guessed", () => {
  assert.equal(bucketTicketSize("TBC"), "unspecified");
  assert.equal(bucketTicketSize(""), "unspecified");
});

// --- deriveLifecyclePhase ------------------------------------------------

test("deriveLifecyclePhase: a lead with no membership anywhere is just 'Lead'", () => {
  const phase = deriveLifecyclePhase("a", {});
  assert.equal(phase.key, "lead");
});

test("deriveLifecyclePhase: reports the FURTHEST stage reached, not the first one matched", () => {
  const membership = {
    outreach: new Set(["a"]),
    nda: new Set(["a"]),
    zoom: new Set(["a"]),
    ioi: new Set(["a"])
    // dataRoom, fieldVisit, termSheet deliberately not reached
  };
  const phase = deriveLifecyclePhase("a", membership);
  assert.equal(phase.key, "ioi", "IOI is the furthest stage this lead is actually in, despite dataRoom being skipped");
});

test("deriveLifecyclePhase: a lead only in termSheet is reported at termSheet even without every intermediate stage set", () => {
  const phase = deriveLifecyclePhase("a", { termSheet: new Set(["a"]) });
  assert.equal(phase.key, "termSheet");
});

// --- deriveNextActionDue -------------------------------------------------

test("deriveNextActionDue: picks the earliest of several candidate dates", () => {
  const due = deriveNextActionDue([daysFromNow(30), daysFromNow(5), daysFromNow(14)]);
  assert.equal(Math.round((due - Date.now()) / (24 * 60 * 60 * 1000)), 5);
});

test("deriveNextActionDue: null and invalid dates are ignored, not treated as 'due now'", () => {
  const due = deriveNextActionDue([null, undefined, new Date("not-a-date"), daysFromNow(10)]);
  assert.ok(due, "the one valid date should still be found");
  assert.equal(Math.round((due - Date.now()) / (24 * 60 * 60 * 1000)), 10);
});

test("deriveNextActionDue: no candidates at all returns null", () => {
  assert.equal(deriveNextActionDue([]), null);
  assert.equal(deriveNextActionDue([null, undefined]), null);
});

// --- bucketDueWindow -------------------------------------------------------

test("bucketDueWindow: buckets relative to now", () => {
  const now = new Date("2026-01-15T00:00:00Z");
  assert.equal(bucketDueWindow(new Date("2026-01-10T00:00:00Z"), now), "overdue");
  assert.equal(bucketDueWindow(new Date("2026-01-18T00:00:00Z"), now), "due_7d");
  assert.equal(bucketDueWindow(new Date("2026-02-01T00:00:00Z"), now), "due_30d");
  assert.equal(bucketDueWindow(new Date("2026-06-01T00:00:00Z"), now), "none");
});

test("bucketDueWindow: no due date at all is 'none', not 'overdue'", () => {
  assert.equal(bucketDueWindow(null), "none");
});

// --- matchesFilters --------------------------------------------------------

const baseRow = {
  name: "Deepa Paul",
  company: "Nordwind Energy",
  channelPartner: "Meridian Partners",
  industry: "Renewables",
  territory: "DACH",
  temperature: "HOT",
  teamLeader: "Rahul R",
  manager: "Anika T",
  leadSource: "Referral",
  status: "QUALIFIED",
  lifecyclePhase: "nda",
  ticketSizeBand: "1m_5m",
  dueWindow: "due_7d",
  doe: "Rahul R",
  createdAt: new Date("2026-01-01")
};

test("matchesFilters: an empty filter set matches everything", () => {
  assert.equal(matchesFilters(baseRow, {}), true);
});

test("matchesFilters: every criterion must match simultaneously (AND, not OR)", () => {
  assert.equal(matchesFilters(baseRow, { industry: "Renewables", status: "QUALIFIED" }), true);
  assert.equal(matchesFilters(baseRow, { industry: "Renewables", status: "LOST" }), false);
});

test("matchesFilters: text search matches name or company, case-insensitively", () => {
  assert.equal(matchesFilters(baseRow, { q: "nordwind" }), true);
  assert.equal(matchesFilters(baseRow, { q: "DEEPA" }), true);
  assert.equal(matchesFilters(baseRow, { q: "unrelated" }), false);
});

test("matchesFilters: DOE filters by exact rep name", () => {
  assert.equal(matchesFilters(baseRow, { doe: "Rahul R" }), true);
  assert.equal(matchesFilters(baseRow, { doe: "Meera S" }), false);
});

test("matchesFilters: a lead with no DOE set fails a DOE filter rather than passing by default", () => {
  const noDoe = { ...baseRow, doe: null };
  assert.equal(matchesFilters(noDoe, { doe: "Rahul R" }), false);
});

test("matchesFilters: time window filters on createdAt inclusively", () => {
  assert.equal(matchesFilters(baseRow, { timeFrom: "2025-12-01", timeTo: "2026-02-01" }), true);
  assert.equal(matchesFilters(baseRow, { timeFrom: "2026-02-01" }), false);
});

test("LIFECYCLE_STAGES: is ordered Lead first, Term sheet last, matching the funnel", () => {
  assert.equal(LIFECYCLE_STAGES[0].key, "lead");
  assert.equal(LIFECYCLE_STAGES.at(-1).key, "termSheet");
});
