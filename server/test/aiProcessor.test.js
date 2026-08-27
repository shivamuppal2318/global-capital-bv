import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProcessingPrompt, parseProcessingResponse, isAiProcessorConfigured } from "../src/lib/marketIntelligence/aiProcessor.js";

test("buildProcessingPrompt includes the article title and content", () => {
  const prompt = buildProcessingPrompt({ rawTitle: "Acme raises $50M", rawContent: "Acme Corp announced today..." });
  assert.match(prompt, /Acme raises \$50M/);
  assert.match(prompt, /Acme Corp announced today/);
});

test("buildProcessingPrompt truncates very long content to 4000 chars", () => {
  const longContent = "x".repeat(10000);
  const prompt = buildProcessingPrompt({ rawTitle: "T", rawContent: longContent });
  // the prompt contains other text too, but the included slice of content
  // should not exceed 4000 chars of the original "x" run
  const xRunLength = (prompt.match(/x+/) ?? [""])[0].length;
  assert.ok(xRunLength <= 4000);
});

test("buildProcessingPrompt asks for the three scoring flags, using the given criteria's labels", () => {
  const criteria = [
    { key: "HAS_CONCRETE_DETAIL", label: "States a real deal size" },
    { key: "HAS_REAL_CONTENT", label: "Content beyond the headline" },
    { key: "ENTITY_CLEARLY_NAMED", label: "Company is specifically named" }
  ];
  const prompt = buildProcessingPrompt({ rawTitle: "T", rawContent: "C" }, criteria);
  assert.match(prompt, /States a real deal size/);
  assert.match(prompt, /Content beyond the headline/);
  assert.match(prompt, /Company is specifically named/);
  assert.match(prompt, /"hasConcreteDetail": boolean/);
});

test("parseProcessingResponse parses a well-formed JSON response", () => {
  const response = JSON.stringify({
    entityName: "Acme Corp",
    signalType: "FUNDING",
    hasConcreteDetail: true,
    hasRealContent: true,
    entityClearlyNamed: true,
    summary: "Acme raised a $50M Series B."
  });
  const result = parseProcessingResponse(response);
  assert.deepEqual(result, {
    entityName: "Acme Corp",
    signalType: "FUNDING",
    hasConcreteDetail: true,
    hasRealContent: true,
    entityClearlyNamed: true,
    summary: "Acme raised a $50M Series B."
  });
});

test("parseProcessingResponse strips markdown code fences some models wrap JSON in", () => {
  const response =
    "```json\n" +
    JSON.stringify({ entityName: "Acme", signalType: "OTHER", hasConcreteDetail: false, hasRealContent: false, entityClearlyNamed: true, summary: "x" }) +
    "\n```";
  const result = parseProcessingResponse(response);
  assert.equal(result.entityName, "Acme");
});

test("parseProcessingResponse defaults summary to empty string when absent", () => {
  const response = JSON.stringify({
    entityName: "Acme",
    signalType: "OTHER",
    hasConcreteDetail: false,
    hasRealContent: false,
    entityClearlyNamed: false
  });
  assert.equal(parseProcessingResponse(response).summary, "");
});

test("parseProcessingResponse throws on non-JSON text", () => {
  assert.throws(() => parseProcessingResponse("Sorry, I can't help with that."), /non-JSON response/);
});

test("parseProcessingResponse throws when entityName is missing", () => {
  const response = JSON.stringify({ signalType: "OTHER", hasConcreteDetail: false, hasRealContent: false, entityClearlyNamed: false, summary: "x" });
  assert.throws(() => parseProcessingResponse(response), /entityName/);
});

test("parseProcessingResponse throws on an invalid signalType", () => {
  const response = JSON.stringify({
    entityName: "Acme",
    signalType: "MADE_UP_TYPE",
    hasConcreteDetail: false,
    hasRealContent: false,
    entityClearlyNamed: false,
    summary: "x"
  });
  assert.throws(() => parseProcessingResponse(response), /invalid signalType/);
});

test("parseProcessingResponse throws when a scoring flag is missing or not boolean", () => {
  const missing = JSON.stringify({ entityName: "Acme", signalType: "OTHER", hasConcreteDetail: true, hasRealContent: true, summary: "x" });
  const wrongType = JSON.stringify({
    entityName: "Acme",
    signalType: "OTHER",
    hasConcreteDetail: "yes",
    hasRealContent: true,
    entityClearlyNamed: true,
    summary: "x"
  });
  assert.throws(() => parseProcessingResponse(missing), /entityClearlyNamed/);
  assert.throws(() => parseProcessingResponse(wrongType), /hasConcreteDetail/);
});

// isAiProcessorConfigured is now async — credentials can come from the
// database (Admin Panel → AI Assistant) before falling back to
// ANTHROPIC_API_KEY, see lib/aiSettings.js. That DB check means this needs
// a real Postgres connection to run at all; skipped rather than failed
// when only a local/non-Postgres DATABASE_URL is available, same as any
// other test that can't reach its dependency.
test("isAiProcessorConfigured reflects ANTHROPIC_API_KEY presence", async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(await isAiProcessorConfigured(), false);
    process.env.ANTHROPIC_API_KEY = "test-key";
    assert.equal(await isAiProcessorConfigured(), true);
  } catch (err) {
    if (err.name === "PrismaClientInitializationError" || err.name === "PrismaClientKnownRequestError") {
      t.skip(`No reachable database for aiSettings lookup: ${err.message.split("\n")[0]}`);
      return;
    }
    throw err;
  } finally {
    if (original === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = original;
    }
  }
});
