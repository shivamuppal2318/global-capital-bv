import { test } from "node:test";
import assert from "node:assert/strict";
import { isAccountUnderDailyCap } from "../src/lib/accountSendCap.js";

function fakeClient(count) {
  return { emailActivityLog: { count: async () => count } };
}

// 30 days old — past the warmup.js ramp's last step (day 21), so these
// existing tests exercise the account's flat, fully-ramped dailyLimit
// exactly as before the warm-up ramp was added below.
const FULLY_RAMPED_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

test("returns true (no cap to check) when no account is assigned", async () => {
  assert.equal(await isAccountUnderDailyCap(null, fakeClient(999)), true);
});

test("returns true when sent count is below the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500, createdAt: FULLY_RAMPED_DATE };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(400)), true);
});

test("returns false when sent count equals the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500, createdAt: FULLY_RAMPED_DATE };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(500)), false);
});

test("returns false when sent count exceeds the account's dailyLimit", async () => {
  const account = { id: "acct-1", dailyLimit: 500, createdAt: FULLY_RAMPED_DATE };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(501)), false);
});

test("scopes the count query directly to the account a send actually went through", async () => {
  let capturedArgs;
  const client = {
    emailActivityLog: {
      count: async (args) => {
        capturedArgs = args;
        return 0;
      }
    }
  };

  await isAccountUnderDailyCap({ id: "acct-42", dailyLimit: 100, createdAt: FULLY_RAMPED_DATE }, client);

  assert.equal(capturedArgs.where.kind, "BRANCH_EMAIL_SENT");
  // Not lead.campaign.emailAccountId — country-based routing
  // (accountRouting.js) can send a lead through a different mailbox than
  // whatever its campaign is assigned to, so the cap has to count against
  // the real emailAccountId recorded on the activity log row itself.
  assert.equal(capturedArgs.where.emailAccountId, "acct-42");
  assert.ok(capturedArgs.where.createdAt.gte instanceof Date);
});

// The actual gap this covers: an account's own age now restricts its cap
// the same way a campaign's age does (see sendCap.test.js's equivalent
// warm-up cases) — a brand-new mailbox can't send its full configured
// dailyLimit on day one just because it's attached to an old, already
// fully-ramped campaign.
test("a brand-new account (created just now) is held to the day-0 ramp limit, not its full dailyLimit", async () => {
  const account = { id: "acct-new", dailyLimit: 2000, createdAt: new Date() };
  // Day-0 ramp limit is 50 (see warmup.js) — 40 sent today is still under it.
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(40)), true);
  // 50 sent today has hit the day-0 ramp limit, even though dailyLimit is 2000.
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(50)), false);
});

test("an account past full ramp-up (21+ days) is capped at its configured dailyLimit, uncapped by warm-up", async () => {
  const account = { id: "acct-old", dailyLimit: 500, createdAt: FULLY_RAMPED_DATE };
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(499)), true);
  assert.equal(await isAccountUnderDailyCap(account, fakeClient(500)), false);
});
