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

// Without this scoping, a Channel Partner's campaign could route through a
// completely different partner's (or a staff member's own) connected
// mailbox just because it happened to share a country tag — a real
// cross-tenant leak, not just a wrong "from" address.
test("scopes the country match to the campaign's own channel partner for a partner-owned campaign", async () => {
  const { client, getCapturedArgs } = fakeClient({ id: "acct-in", country: "IN", ownerChannelPartnerId: "partner-1" });
  const lead = { country: "IN" };
  const campaign = { ownerChannelPartnerId: "partner-1", emailAccount: null };

  await resolveEmailAccount(lead, campaign, client);

  assert.equal(getCapturedArgs().where.ownerChannelPartnerId, "partner-1");
});

test("scopes the country match to non-partner mailboxes for a staff/admin-owned campaign", async () => {
  const { client, getCapturedArgs } = fakeClient({ id: "acct-in", country: "IN" });
  const lead = { country: "IN" };
  const campaign = { emailAccount: null }; // no ownerChannelPartnerId -- staff/admin-owned

  await resolveEmailAccount(lead, campaign, client);

  assert.equal(getCapturedArgs().where.ownerChannelPartnerId, null);
});
