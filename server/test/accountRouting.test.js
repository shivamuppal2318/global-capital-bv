import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEmailAccount } from "../src/lib/accountRouting.js";

// `responder` can be a fixed value (every findFirst call returns it) or a
// function of the call's args (so a country-match query and the
// partner's-own-mailbox fallback query — resolveEmailAccount can issue
// either or both — can be answered differently in the same test).
function fakeClient(responder) {
  const calls = [];
  const respond = typeof responder === "function" ? responder : () => responder;
  return {
    client: {
      emailAccount: {
        findFirst: async (args) => {
          calls.push(args);
          return respond(args);
        }
      }
    },
    getCapturedArgs: () => calls[calls.length - 1],
    getCallCount: () => calls.length
  };
}

test("routes to the country-matching account even when a different one is assigned to the campaign", async () => {
  const inAccount = { id: "acct-in", country: "IN" };
  const { client } = fakeClient(inAccount);
  const lead = { country: "IN" };
  const campaign = { emailAccount: { id: "acct-default", isActive: true } };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved.id, "acct-in");
});

test("falls back to the campaign's assigned account when the lead has no country", async () => {
  const { client } = fakeClient(null);
  const lead = { country: null };
  const campaign = { emailAccount: { id: "acct-default", isActive: true } };

  const resolved = await resolveEmailAccount(lead, campaign, client);
  assert.equal(resolved.id, "acct-default");
});

test("falls back to the campaign's assigned account when no mailbox matches the lead's country", async () => {
  const { client } = fakeClient(null);
  const lead = { country: "SG" };
  const campaign = { emailAccount: { id: "acct-default", isActive: true } };

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

// A partner who has connected their own mailbox should never fall through to
// the shared admin identity just because nobody remembered to explicitly
// assign it to this particular campaign.
test("falls back to the channel partner's own active mailbox when nothing else matched", async () => {
  const ownMailbox = { id: "acct-partner-own", ownerChannelPartnerId: "partner-1" };
  const { client, getCapturedArgs } = fakeClient((args) => (args.where.country ? null : ownMailbox));
  const lead = { country: null };
  const campaign = { ownerChannelPartnerId: "partner-1", emailAccount: null };

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved.id, "acct-partner-own");
  assert.equal(getCapturedArgs().where.ownerChannelPartnerId, "partner-1");
});

test("does not fall through to any mailbox for a staff/admin campaign with nothing assigned", async () => {
  const { client, getCallCount } = fakeClient(null);
  const lead = { country: null };
  const campaign = { emailAccount: null }; // staff/admin-owned -- no partner fallback exists

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved, null);
  // Only the campaign's own assignment was checked (no country, no
  // partner id) -- no extra findFirst call should have been made.
  assert.equal(getCallCount(), 0);
});

test("prefers the campaign's own explicitly-assigned mailbox over the partner's other mailboxes", async () => {
  const { client, getCallCount } = fakeClient(() => {
    throw new Error("should not query for a partner fallback when the campaign already has an active assigned mailbox");
  });
  const lead = { country: null };
  const campaign = { ownerChannelPartnerId: "partner-1", emailAccount: { id: "acct-assigned", isActive: true } };

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved.id, "acct-assigned");
  assert.equal(getCallCount(), 0);
});
