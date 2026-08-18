import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRespondToReply } from "../src/lib/autoRespond.js";

test("sends the NDA template for an INTERESTED reply", async () => {
  const calls = [];
  const fakeSend = async (leadId, templateKey) => {
    calls.push({ leadId, templateKey });
    return { activity: { id: "act-1" }, warnings: [] };
  };

  const result = await autoRespondToReply("lead-1", "INTERESTED", fakeSend);

  assert.equal(result.sent, true);
  assert.equal(result.templateKey, "interested");
  assert.deepEqual(calls, [{ leadId: "lead-1", templateKey: "interested" }]);
});

test("sends the calendly template for a ZOOM_REQUEST reply", async () => {
  const fakeSend = async (_leadId, templateKey) => ({ activity: {}, warnings: [], templateKey });
  const result = await autoRespondToReply("lead-1", "ZOOM_REQUEST", fakeSend);
  assert.equal(result.sent, true);
  assert.equal(result.templateKey, "zoom-request");
});

test("sends the info-request template for an INFO_REQUEST reply", async () => {
  const fakeSend = async () => ({ activity: {}, warnings: [] });
  const result = await autoRespondToReply("lead-1", "INFO_REQUEST", fakeSend);
  assert.equal(result.sent, true);
  assert.equal(result.templateKey, "info-request");
});

test("does nothing for NO_REPLY — nothing to respond to", async () => {
  let called = false;
  const fakeSend = async () => { called = true; return {}; };
  const result = await autoRespondToReply("lead-1", "NO_REPLY", fakeSend);
  assert.equal(result.sent, false);
  assert.match(result.reason, /No auto-response template mapped/);
  assert.equal(called, false);
});

test("does not throw when the send fails — reports it as a non-fatal outcome", async () => {
  const fakeSend = async () => {
    throw new Error("Lead has unsubscribed; suppressing send.");
  };
  const result = await autoRespondToReply("lead-1", "INTERESTED", fakeSend);
  assert.equal(result.sent, false);
  assert.match(result.reason, /unsubscribed/);
});
