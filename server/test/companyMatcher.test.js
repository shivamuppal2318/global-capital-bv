import { test } from "node:test";
import assert from "node:assert/strict";
import { findExistingLeadByCompany } from "../src/lib/marketIntelligence/companyMatcher.js";

test("returns null immediately for an empty/falsy entityName, without querying", async () => {
  let called = false;
  const client = { lead: { findFirst: async () => { called = true; return null; } } };
  const result = await findExistingLeadByCompany("", client);
  assert.equal(result, null);
  assert.equal(called, false);
});

test("queries with a case-insensitive equals match on the trimmed name (exact-match fast path)", async () => {
  let capturedArgs;
  const client = {
    lead: {
      findFirst: async (args) => {
        capturedArgs = args;
        return { id: "lead-1", company: "Acme Corp" };
      }
    }
  };

  const result = await findExistingLeadByCompany("  Acme Corp  ", client);

  assert.equal(capturedArgs.where.company.equals, "Acme Corp");
  assert.equal(capturedArgs.where.company.mode, "insensitive");
  assert.equal(result.id, "lead-1");
});

test("falls back to fuzzy matching when no exact match exists", async () => {
  const client = {
    lead: {
      findFirst: async () => null,
      findMany: async () => [
        { id: "lead-1", company: "Nordwind Energy" },
        { id: "lead-2", company: "Unrelated Co" }
      ],
      findUnique: async ({ where }) => ({ id: where.id, company: "Nordwind Energy" })
    }
  };

  // Slight typo — should still match "Nordwind Energy" via fuzzy comparison.
  const result = await findExistingLeadByCompany("Nordwnd Energy", client);
  assert.equal(result.id, "lead-1");
});

test("returns null when no lead matches, even fuzzily", async () => {
  const client = {
    lead: {
      findFirst: async () => null,
      findMany: async () => [{ id: "lead-1", company: "Totally Different Company" }]
    }
  };
  const result = await findExistingLeadByCompany("Nonexistent Co", client);
  assert.equal(result, null);
});

test("returns null when there are no other leads to compare against", async () => {
  const client = { lead: { findFirst: async () => null, findMany: async () => [] } };
  const result = await findExistingLeadByCompany("Some Co", client);
  assert.equal(result, null);
});
