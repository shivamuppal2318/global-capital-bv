import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEmailAccount } from "../src/lib/accountRouting.js";

function fakeClient(matchingAccount) {
  let capturedArgs;
  return {
    client: {
      emailAccount: {
        findFirst: async (args) => {
          capturedArgs = args;
          return matchingAccount;
        }
      }
    },
    getCapturedArgs: () => capturedArgs
  };
}

test("routes to the country-matching account even when a different one is assigned to the campaign", async () => {
  const inAccount = { id: "acct-in", country: "IN" };
  const { client } = fakeClient(inAccount);
  const lead = { country: "IN" };
  const campaign = { emailAccount: { id: "acct-default" } };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved.id, "acct-in");
});

test("falls back to the campaign's assigned account when the lead has no country", async () => {
  const { client } = fakeClient(null);
  const lead = { country: null };
  const campaign = { emailAccount: { id: "acct-default" } };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved.id, "acct-default");
});

test("falls back to the campaign's assigned account when no mailbox matches the lead's country", async () => {
  const { client } = fakeClient(null);
  const lead = { country: "SG" };
  const campaign = { emailAccount: { id: "acct-default" } };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved.id, "acct-default");
});

test("returns null when the lead has no country and the campaign has no assigned account either", async () => {
  const { client } = fakeClient(null);
  const lead = { country: null };
  const campaign = { emailAccount: null };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved, null);
});

test("matches country case-insensitively via the query filter", async () => {
  const { client, getCapturedArgs } = fakeClient({ id: "acct-nl", country: "nl" });
  const lead = { country: "NL" };

  await resolveEmailAccount(lead, { emailAccount: null }, client);

  assert.equal(getCapturedArgs().where.country.equals, "NL");
  assert.equal(getCapturedArgs().where.country.mode, "insensitive");
  assert.equal(getCapturedArgs().where.isActive, true);
});
