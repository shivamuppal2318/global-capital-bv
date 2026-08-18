import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCompanyName, companyNameSimilarity } from "../src/lib/marketIntelligence/companyNameMatch.js";

test("normalizeCompanyName strips common legal suffixes", () => {
  assert.equal(normalizeCompanyName("Acme Inc"), "acme");
  assert.equal(normalizeCompanyName("Acme, Incorporated"), "acme");
  assert.equal(normalizeCompanyName("ACME CORPORATION"), "acme");
  assert.equal(normalizeCompanyName("Acme B.V."), "acme");
  assert.equal(normalizeCompanyName("Acme GmbH"), "acme");
});

test("normalizeCompanyName does not strip a suffix that's the whole name", () => {
  // "Group" alone shouldn't reduce to an empty string
  assert.equal(normalizeCompanyName("Group"), "group");
});

test("normalizeCompanyName collapses punctuation and extra whitespace", () => {
  assert.equal(normalizeCompanyName("  Acme,   Corp.  "), "acme");
});

test("companyNameSimilarity returns 1 for identical names after normalization", () => {
  assert.equal(companyNameSimilarity("Acme Inc", "ACME, INCORPORATED"), 1);
});

test("companyNameSimilarity returns 0 for empty/missing input", () => {
  assert.equal(companyNameSimilarity("", "Acme"), 0);
  assert.equal(companyNameSimilarity("Acme", null), 0);
});

test("companyNameSimilarity is high for a minor typo", () => {
  const score = companyNameSimilarity("Nordwind Energy", "Nordwnd Energy");
  assert.ok(score > 0.85, `expected > 0.85, got ${score}`);
});

test("companyNameSimilarity is low for genuinely different companies that share a word", () => {
  const score = companyNameSimilarity("Acme Corp", "Acme Industries");
  assert.ok(score < 0.85, `expected < 0.85, got ${score}`);
});

test("companyNameSimilarity is symmetric", () => {
  const a = companyNameSimilarity("Nordwind Energy", "Nordwnd Energy");
  const b = companyNameSimilarity("Nordwnd Energy", "Nordwind Energy");
  assert.equal(a, b);
});
