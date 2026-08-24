import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executiveFunnel,
  outreachMetrics,
  dealAgeMetrics,
  winRateMetrics,
  activeDealsMetrics,
  parseApproxAmount,
  pipelineValueMetrics
} from "../src/lib/executiveMetrics.js";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// --- executiveFunnel -------------------------------------------------------

test("executiveFunnel: called with no arguments returns eight empty stages", () => {
  const f = executiveFunnel();
  assert.equal(f.length, 8);
  assert.deepEqual(f.map((s) => s.count), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(f[0].label, "Lead");
  assert.equal(f.at(-1).label, "Term sheet");
});

test("executiveFunnel: counts distinct ids and derives stage-to-stage conversion", () => {
  const f = executiveFunnel({
    lead: ["a", "b", "c", "d"],
    outreach: ["a", "b", "c"],
    nda: ["a", "b"],
    zoom: ["a"]
  });
  assert.deepEqual(f.map((s) => s.count), [4, 3, 2, 1, 0, 0, 0, 0]);
  assert.equal(f[0].conversionFromPrevious, null, "nothing precedes the top of the funnel");
  assert.equal(f[1].conversionFromPrevious, 75);
  assert.equal(f[1].dropOff, 1);
  assert.equal(f[3].shareOfTop, 25);
});

test("executiveFunnel: a duplicated id in one stage is counted once", () => {
  const f = executiveFunnel({ lead: ["a", "a", "b"], outreach: ["a"] });
  assert.equal(f[0].count, 2);
});

test("executiveFunnel: an empty preceding stage gives null conversion, not a divide-by-zero", () => {
  const f = executiveFunnel({ lead: [], outreach: [], nda: ["a"] });
  assert.equal(f[1].conversionFromPrevious, null);
  assert.equal(f[2].conversionFromPrevious, null);
  assert.equal(f[0].shareOfTop, null, "an empty funnel has no top to take a share of");
});

// --- outreachMetrics ---------------------------------------------------

test("outreachMetrics: empty input returns null rate, not NaN", () => {
  const m = outreachMetrics([]);
  assert.equal(m.totalOutreach, 0);
  assert.equal(m.responseRate, null);
});

test("outreachMetrics: response rate counts anything other than NO_REPLY", () => {
  const m = outreachMetrics([
    { replyType: "INTERESTED" },
    { replyType: "ZOOM_REQUEST" },
    { replyType: "NO_REPLY" },
    { replyType: "NO_REPLY" }
  ]);
  assert.equal(m.responded, 2);
  assert.equal(m.responseRate, 50);
});

// --- dealAgeMetrics ------------------------------------------------------

test("dealAgeMetrics: excludes closed leads from the average", () => {
  const m = dealAgeMetrics([
    { status: "QUALIFIED", createdAt: daysAgo(10) },
    { status: "NEGOTIATION", createdAt: daysAgo(30) },
    { status: "CONVERTED", createdAt: daysAgo(400) }, // would wreck the average if counted
    { status: "LOST", createdAt: daysAgo(400) }
  ]);
  assert.equal(m.activeCount, 2);
  assert.equal(m.avgDays, 20, "(10 + 30) / 2, unaffected by the closed leads");
});

test("dealAgeMetrics: empty input returns null, not NaN", () => {
  assert.equal(dealAgeMetrics([]).avgDays, null);
});

// --- winRateMetrics --------------------------------------------------------

test("winRateMetrics: open leads are excluded from the denominator", () => {
  const m = winRateMetrics([
    { status: "CONVERTED" },
    { status: "CONVERTED" },
    { status: "LOST" },
    { status: "QUALIFIED" },
    { status: "NEW" }
  ]);
  assert.equal(m.closed, 3, "only won + lost, the two open leads are excluded");
  assert.equal(m.winRate, round1((2 / 3) * 100));
});

test("winRateMetrics: no closed leads yet returns null, not 0%", () => {
  const m = winRateMetrics([{ status: "NEW" }, { status: "QUALIFIED" }]);
  assert.equal(m.closed, 0);
  assert.equal(m.winRate, null);
});

// --- activeDealsMetrics ------------------------------------------------

test("activeDealsMetrics: trend compares the last 30 days against the 30 before that", () => {
  const m = activeDealsMetrics([
    { status: "QUALIFIED", createdAt: daysAgo(5) },
    { status: "QUALIFIED", createdAt: daysAgo(10) },
    { status: "NEGOTIATION", createdAt: daysAgo(45) },
    { status: "CONVERTED", createdAt: daysAgo(2) } // closed, must not count anywhere
  ]);
  assert.equal(m.count, 3, "closed lead excluded from the active count");
  assert.equal(m.recentWindow, 2);
  assert.equal(m.priorWindow, 1);
  assert.equal(m.trendPct, 100, "2 vs 1 is a 100% increase");
});

test("activeDealsMetrics: no leads in the prior window gives null trend, not a fabricated percentage", () => {
  const m = activeDealsMetrics([{ status: "QUALIFIED", createdAt: daysAgo(1) }]);
  assert.equal(m.priorWindow, 0);
  assert.equal(m.trendPct, null);
});

// --- parseApproxAmount ---------------------------------------------------

test("parseApproxAmount: a single figure with a unit suffix", () => {
  assert.equal(parseApproxAmount("EUR 4.5M"), 4_500_000);
  assert.equal(parseApproxAmount("€2,000,000"), 2_000_000);
  assert.equal(parseApproxAmount("650K"), 650_000);
});

test("parseApproxAmount: a range takes the midpoint, not the second number alone", () => {
  assert.equal(parseApproxAmount("2-4M"), 3_000_000);
  assert.equal(parseApproxAmount("EUR 1.5M - 2.5M"), 2_000_000);
});

test("parseApproxAmount: unparseable or empty text returns null, never 0", () => {
  assert.equal(parseApproxAmount("TBC"), null);
  assert.equal(parseApproxAmount(""), null);
  assert.equal(parseApproxAmount(null), null);
});

// --- pipelineValueMetrics ------------------------------------------------

test("pipelineValueMetrics: declined and expired IOIs are excluded from the total", () => {
  const m = pipelineValueMetrics({
    ioiRecords: [
      { status: "SENT", value: 2_000_000 },
      { status: "DECLINED", value: 5_000_000 },
      { status: "EXPIRED", value: 5_000_000 }
    ]
  });
  assert.equal(m.ioiCount, 1);
  assert.equal(m.ioiTotal, 2_000_000);
});

test("pipelineValueMetrics: sums parsed term sheet amounts alongside IOI value", () => {
  const m = pipelineValueMetrics({
    ioiRecords: [{ status: "SIGNED", value: 1_000_000 }],
    termSheetRecords: [{ status: "COMPLETED", amount: "EUR 3M" }, { status: "DECLINED", amount: "EUR 9M" }]
  });
  assert.equal(m.termSheetCount, 1, "the declined term sheet is excluded");
  assert.equal(m.termSheetTotal, 3_000_000);
  assert.equal(m.total, 4_000_000);
});

test("pipelineValueMetrics: an unparseable live term sheet is reported, not silently dropped", () => {
  const m = pipelineValueMetrics({ termSheetRecords: [{ status: "IN_PROGRESS", amount: "TBC" }] });
  assert.equal(m.termSheetCount, 0);
  assert.equal(m.termSheetTotal, 0);
  assert.equal(m.termSheetUnparsed, 1, "the gap in the total must be visible, not hidden");
});

test("pipelineValueMetrics: empty input returns zeros, never NaN", () => {
  const m = pipelineValueMetrics();
  assert.equal(m.total, 0);
  assert.equal(m.ioiCount, 0);
  assert.equal(m.termSheetUnparsed, 0);
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
