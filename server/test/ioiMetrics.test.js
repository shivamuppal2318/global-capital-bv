import { test } from "node:test";
import assert from "node:assert/strict";
import { ioiMetrics, dealFunnel } from "../src/lib/relationshipMetrics.js";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// --- IOI KPIs ------------------------------------------------------------

test("ioiMetrics: empty input returns zeros and nulls, never NaN", () => {
  const m = ioiMetrics([]);
  assert.equal(m.generated, 0);
  assert.equal(m.signed, 0);
  assert.equal(m.avgValue, null);
  assert.equal(m.signRate, null);
  assert.deepEqual(m.byIndustry, []);
});

test("ioiMetrics: a draft with no generated date is not counted as generated", () => {
  const m = ioiMetrics([
    { status: "DRAFT", generatedAt: null },
    { status: "SENT", generatedAt: daysAgo(3) }
  ]);
  assert.equal(m.generated, 1, "the untouched draft has not been issued");
});

test("ioiMetrics: a draft that already has a generated date still counts", () => {
  // Status and timestamp can disagree if someone edits the status back;
  // the timestamp is the harder evidence that it was actually issued.
  const m = ioiMetrics([{ status: "DRAFT", generatedAt: daysAgo(1) }]);
  assert.equal(m.generated, 1);
});

test("ioiMetrics: average value ignores unpriced IOIs rather than treating them as zero", () => {
  const m = ioiMetrics([
    { status: "SENT", value: 2000000 },
    { status: "SENT", value: 4000000 },
    { status: "SENT", value: null }
  ]);
  assert.equal(m.pricedCount, 2);
  assert.equal(m.totalValue, 6000000);
  assert.equal(m.avgValue, 3000000, "the unpriced IOI must not drag the average to 2M");
});

test("ioiMetrics: sign rate is a share of generated, and signed counts by timestamp", () => {
  const m = ioiMetrics([
    { status: "SIGNED", generatedAt: daysAgo(9), signedAt: daysAgo(2) },
    { status: "SENT", generatedAt: daysAgo(5), signedAt: null },
    { status: "DECLINED", generatedAt: daysAgo(6), signedAt: null },
    { status: "DRAFT", generatedAt: null }
  ]);
  assert.equal(m.generated, 3, "the untouched draft is excluded");
  assert.equal(m.signed, 1);
  assert.equal(m.declined, 1);
  assert.equal(m.pending, 1, "declined is not pending");
  assert.equal(m.signRate, round1((1 / 3) * 100));
});

test("ioiMetrics: distributions are sorted by count and fold blanks into Unspecified", () => {
  const m = ioiMetrics([
    { status: "SENT", industry: "Renewables", geography: "Benelux" },
    { status: "SENT", industry: "Renewables", geography: "MENA" },
    { status: "SENT", industry: "Logistics", geography: "Benelux" },
    { status: "SENT", industry: "   ", geography: null }
  ]);
  assert.deepEqual(m.byIndustry[0], { label: "Renewables", count: 2, share: 50 });
  assert.equal(m.byIndustry.at(-1).label, "Unspecified");
  assert.equal(
    m.byIndustry.find((r) => r.label === "Unspecified").count,
    1,
    "whitespace-only industry is a gap, not its own category"
  );
  assert.equal(m.byGeography.find((r) => r.label === "Benelux").count, 2);
});

// --- Funnel --------------------------------------------------------------

test("dealFunnel: counts distinct leads per stage and derives stage-to-stage conversion", () => {
  const f = dealFunnel({
    nda: ["a", "b", "c", "d"],
    zoom: ["a", "b", "c"],
    dataRoom: ["a", "b"],
    ioi: ["a"],
    termSheet: []
  });
  assert.deepEqual(f.map((s) => s.count), [4, 3, 2, 1, 0]);
  assert.equal(f[0].conversionFromPrevious, null, "nothing precedes the top of the funnel");
  assert.equal(f[1].conversionFromPrevious, 75);
  assert.equal(f[1].dropOff, 1);
  assert.equal(f[3].shareOfTop, 25);
});

test("dealFunnel: a lead listed twice in a stage is counted once", () => {
  const f = dealFunnel({ nda: ["a", "a", "b"], zoom: ["a"] });
  assert.equal(f[0].count, 2, "duplicate ids must not inflate the stage");
});

test("dealFunnel: an empty preceding stage gives null conversion, not a divide-by-zero", () => {
  const f = dealFunnel({ nda: [], zoom: [], dataRoom: ["a"] });
  assert.equal(f[1].conversionFromPrevious, null);
  assert.equal(f[2].conversionFromPrevious, null);
  assert.equal(f[0].shareOfTop, null, "an empty funnel has no top to take a share of");
});

test("dealFunnel: a later stage larger than an earlier one is reported, not clamped", () => {
  // Real data does this: an IOI can be recorded for a lead whose NDA was
  // never logged. Silently clamping would hide the missing record.
  const f = dealFunnel({ nda: ["a"], zoom: ["a", "b"] });
  assert.equal(f[1].count, 2);
  assert.equal(f[1].conversionFromPrevious, 200);
  assert.equal(f[1].dropOff, 0, "drop-off never goes negative");
});

test("dealFunnel: called with no arguments returns five empty stages", () => {
  const f = dealFunnel();
  assert.equal(f.length, 5);
  assert.deepEqual(f.map((s) => s.count), [0, 0, 0, 0, 0]);
  assert.deepEqual(f.map((s) => s.label), ["NDA", "Zoom call", "Data room", "IOI", "Term sheet"]);
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
