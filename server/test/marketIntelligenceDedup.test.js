import { test } from "node:test";
import assert from "node:assert/strict";
import { computeContentHash } from "../src/lib/marketIntelligence/dedup.js";

test("same source + title produces the same hash", () => {
  const a = computeContentHash("NEWSAPI", "Acme Corp raises $50M Series B");
  const b = computeContentHash("NEWSAPI", "Acme Corp raises $50M Series B");
  assert.equal(a, b);
});

test("different sources with the same title produce different hashes", () => {
  const a = computeContentHash("NEWSAPI", "Acme Corp raises $50M Series B");
  const b = computeContentHash("EXA", "Acme Corp raises $50M Series B");
  assert.notEqual(a, b);
});

test("different titles produce different hashes", () => {
  const a = computeContentHash("NEWSAPI", "Acme Corp raises $50M Series B");
  const b = computeContentHash("NEWSAPI", "Beta Inc acquired by Gamma LLC");
  assert.notEqual(a, b);
});

test("is insensitive to case and extra whitespace (same underlying story)", () => {
  const a = computeContentHash("NEWSAPI", "Acme Corp raises $50M Series B");
  const b = computeContentHash("NEWSAPI", "  ACME CORP   raises $50M series b  ");
  assert.equal(a, b);
});

test("produces a 64-character hex string (sha256)", () => {
  const hash = computeContentHash("EXA", "Some title");
  assert.match(hash, /^[0-9a-f]{64}$/);
});
