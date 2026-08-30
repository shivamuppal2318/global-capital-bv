import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReplyDraftPrompt, parseReplyDraftResponse, isAiReplyAgentConfigured } from "../src/lib/aiReplyAgent.js";
import { invalidateAiConfigCache } from "../src/lib/aiSettings.js";

test("buildReplyDraftPrompt includes the lead's name, company, and real reply text", () => {
  const prompt = buildReplyDraftPrompt({
    leadName: "Jane Doe",
    company: "Acme Corp",
    replyType: "INTERESTED",
    rawReplyText: "This looks relevant, please share the NDA."
  });
  assert.match(prompt, /Jane Doe/);
  assert.match(prompt, /Acme Corp/);
  assert.match(prompt, /please share the NDA/);
});

test("buildReplyDraftPrompt describes a proactive follow-up when there is no raw reply text yet", () => {
  const prompt = buildReplyDraftPrompt({ leadName: "Jane Doe", company: "Acme Corp", replyType: "NO_REPLY", rawReplyText: null });
  assert.match(prompt, /proactive follow-up/);
});

test("buildReplyDraftPrompt truncates very long reply text to 2000 chars", () => {
  const longReply = "x".repeat(5000);
  const prompt = buildReplyDraftPrompt({ leadName: "N", company: "C", replyType: "INTERESTED", rawReplyText: longReply });
  const xRunLength = (prompt.match(/x+/) ?? [""])[0].length;
  assert.ok(xRunLength <= 2000);
});

test("buildReplyDraftPrompt asks for JSON with a subject and body field", () => {
  const prompt = buildReplyDraftPrompt({ leadName: "N", company: "C", replyType: "ZOOM_REQUEST", rawReplyText: "Can we do a call?" });
  assert.match(prompt, /"subject"/);
  assert.match(prompt, /"body"/);
});

test("parseReplyDraftResponse parses a well-formed JSON response", () => {
  const response = JSON.stringify({ subject: "Next steps", body: "Thanks for reaching out." });
  assert.deepEqual(parseReplyDraftResponse(response), { subject: "Next steps", body: "Thanks for reaching out." });
});

test("parseReplyDraftResponse strips markdown code fences", () => {
  const response = "```json\n" + JSON.stringify({ subject: "S", body: "B" }) + "\n```";
  assert.deepEqual(parseReplyDraftResponse(response), { subject: "S", body: "B" });
});

test("parseReplyDraftResponse throws on non-JSON text", () => {
  assert.throws(() => parseReplyDraftResponse("Sorry, I can't help with that."), /non-JSON response/);
});

test("parseReplyDraftResponse throws when subject or body is missing", () => {
  assert.throws(() => parseReplyDraftResponse(JSON.stringify({ body: "B" })), /subject/);
  assert.throws(() => parseReplyDraftResponse(JSON.stringify({ subject: "S" })), /body/);
});

// isAiReplyAgentConfigured is async — credentials can come from the database
// (Admin Panel → AI Assistant) before falling back to ANTHROPIC_API_KEY, same
// as isAiProcessorConfigured in aiProcessor.test.js. Skipped rather than
// failed when only a local/non-Postgres DATABASE_URL is reachable.
test("isAiReplyAgentConfigured reflects ANTHROPIC_API_KEY presence", async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    invalidateAiConfigCache();
    assert.equal(await isAiReplyAgentConfigured(), false);
    process.env.ANTHROPIC_API_KEY = "test-key";
    invalidateAiConfigCache();
    assert.equal(await isAiReplyAgentConfigured(), true);
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
    invalidateAiConfigCache();
  }
});
