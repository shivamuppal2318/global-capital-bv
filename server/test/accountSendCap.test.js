import { test } from "node:test";
import assert from "node:assert/strict";
import { isAccountUnderDailyCap } from "../src/lib/accountSendCap.js";

function fakeClient(count) {
  return { activityLog: { count: async () => count } };
}

test("returns true (no cap to check) when no account is assigned", async () => {
  assert.equal(await isAccountUnderDailyCap(null, fakeClient(999)), true);
});

test("returns true when sent count is below the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500 };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(400)), true);
});

test("returns false when sent count equals the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500 };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(500)), false);
});

test("returns false when sent count exceeds the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500 };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(501)), false);
});

test("scopes the count query to sends across every campaign sharing this account", async () => {
  let capturedArgs;
  const client = {
    activityLog: {
      count: async (args) => {
        capturedArgs = args;
        return 0;
      }
    }
  };

  await isAccountUnderDailyCap({ id: "acct-42", dailyLimit: 100 }, client);

  assert.equal(capturedArgs.where.kind, "BRANCH_EMAIL_SENT");
  assert.equal(capturedArgs.where.lead.campaign.emailAccountId, "acct-42");
  assert.ok(capturedArgs.where.createdAt.gte instanceof Date);
});
