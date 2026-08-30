import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition, leadMatchesSegment, filterMatchingLeads, SEGMENT_FIELDS, SEGMENT_OPERATORS } from "../src/lib/segmentMatching.js";

const acme = { id: "1", name: "Jane Doe", email: "jane@acme.com", company: "Acme Corp", stage: "NDA Sent", country: "NL", replyType: "INTERESTED" };
const globex = { id: "2", name: "John Roe", email: "john@globex.io", company: "Globex Inc", stage: "Reminder Pending", country: "AE", replyType: "NO_REPLY" };

test("evaluateCondition supports contains, equals, startsWith, endsWith case-insensitively", () => {
  assert.equal(evaluateCondition(acme, { field: "company", operator: "contains", value: "acme" }), true);
  assert.equal(evaluateCondition(acme, { field: "company", operator: "equals", value: "Acme Corp" }), true);
  assert.equal(evaluateCondition(acme, { field: "company", operator: "equals", value: "Acme" }), false);
  assert.equal(evaluateCondition(acme, { field: "email", operator: "startsWith", value: "JANE" }), true);
  assert.equal(evaluateCondition(acme, { field: "email", operator: "endsWith", value: ".com" }), true);
  assert.equal(evaluateCondition(acme, { field: "email", operator: "endsWith", value: ".io" }), false);
});

test("leadMatchesSegment with matchType ALL requires every condition to match", () => {
  const segment = {
    matchType: "ALL",
    conditions: [
      { field: "company", operator: "contains", value: "acme" },
      { field: "country", operator: "equals", value: "NL" }
    ]
  };
  assert.equal(leadMatchesSegment(acme, segment), true);
  assert.equal(leadMatchesSegment(globex, segment), false);
});

test("leadMatchesSegment with matchType ANY requires only one condition to match", () => {
  const segment = {
    matchType: "ANY",
    conditions: [
      { field: "company", operator: "contains", value: "acme" },
      { field: "country", operator: "equals", value: "AE" }
    ]
  };
  assert.equal(leadMatchesSegment(acme, segment), true);
  assert.equal(leadMatchesSegment(globex, segment), true);
});

test("leadMatchesSegment treats no usable conditions as matching everyone", () => {
  assert.equal(leadMatchesSegment(acme, { matchType: "ALL", conditions: [] }), true);
  assert.equal(leadMatchesSegment(acme, { matchType: "ALL", conditions: [{ field: "company", operator: "contains", value: "" }] }), true);
});

test("leadMatchesSegment ignores a condition with an unrecognized field or operator", () => {
  const segment = {
    matchType: "ALL",
    conditions: [{ field: "notARealField", operator: "contains", value: "acme" }]
  };
  // The bad condition is dropped as unusable, leaving zero usable
  // conditions — same as an empty list, matches everyone.
  assert.equal(leadMatchesSegment(acme, segment), true);
  assert.equal(leadMatchesSegment(globex, segment), true);
});

test("filterMatchingLeads returns only the leads that satisfy the segment", () => {
  const segment = { matchType: "ALL", conditions: [{ field: "replyType", operator: "equals", value: "interested" }] };
  const matched = filterMatchingLeads([acme, globex], segment);
  assert.deepEqual(matched.map((lead) => lead.id), ["1"]);
});

test("SEGMENT_FIELDS and SEGMENT_OPERATORS expose real EmailLead-mapped keys, not the old fake ones", () => {
  const fieldKeys = SEGMENT_FIELDS.map((f) => f.key);
  assert.ok(fieldKeys.includes("stage"));
  assert.ok(fieldKeys.includes("replyType"));
  assert.ok(!fieldKeys.includes("source"));
  assert.ok(!fieldKeys.includes("city"));
  assert.ok(SEGMENT_OPERATORS.map((o) => o.key).includes("contains"));
});
