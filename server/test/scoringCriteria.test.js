import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRelevanceScore, DEFAULT_CRITERIA } from "../src/lib/scoringCriteria.js";

test("computeRelevanceScore sums the signal-type points plus every true flag", () => {
  const score = computeRelevanceScore(DEFAULT_CRITERIA, {
    signalType: "FUNDING",
    hasConcreteDetail: true,
    hasRealContent: true,
    entityClearlyNamed: true
  });
  assert.equal(score, 100); // 50 + 25 + 15 + 10
});

test("computeRelevanceScore only counts the signal type's own points when every flag is false", () => {
  const score = computeRelevanceScore(DEFAULT_CRITERIA, {
    signalType: "LEADERSHIP_CHANGE",
    hasConcreteDetail: false,
    hasRealContent: false,
    entityClearlyNamed: false
  });
  assert.equal(score, 15);
});

test("computeRelevanceScore adds only the flags that are actually true", () => {
  const score = computeRelevanceScore(DEFAULT_CRITERIA, {
    signalType: "EXPANSION",
    hasConcreteDetail: false,
    hasRealContent: true,
    entityClearlyNamed: true
  });
  assert.equal(score, 30 + 15 + 10);
});

test("computeRelevanceScore reflects edited point values, not just the defaults", () => {
  const customCriteria = DEFAULT_CRITERIA.map((c) => (c.key === "SIGNAL_FUNDING" ? { ...c, points: 10 } : c));
  const score = computeRelevanceScore(customCriteria, {
    signalType: "FUNDING",
    hasConcreteDetail: false,
    hasRealContent: false,
    entityClearlyNamed: false
  });
  assert.equal(score, 10);
});

test("computeRelevanceScore clamps to 100 even if an admin sets points that sum past it", () => {
  const overfunded = DEFAULT_CRITERIA.map((c) => (c.key === "HAS_CONCRETE_DETAIL" ? { ...c, points: 90 } : c));
  const score = computeRelevanceScore(overfunded, {
    signalType: "FUNDING",
    hasConcreteDetail: true,
    hasRealContent: true,
    entityClearlyNamed: true
  });
  assert.equal(score, 100);
});

test("computeRelevanceScore treats an unknown signal type as zero base points", () => {
  const score = computeRelevanceScore(DEFAULT_CRITERIA, {
    signalType: "SOMETHING_NEW",
    hasConcreteDetail: true,
    hasRealContent: false,
    entityClearlyNamed: false
  });
  assert.equal(score, 25);
});
