import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEmailAccount } from "../src/lib/accountRouting.js";

// `emailAccountResponder`/`userResponder` can each be a fixed value (every
// call to that model returns it) or a function of the call's args — needed
// since resolveEmailAccount can issue more than one emailAccount.findFirst
// call in a single run (a country-match query, then a fallback query) that
// need different answers, plus an optional user.findFirst for DOE lookups.
function fakeClient(emailAccountResponder, userResponder = null) {
  const calls = [];
  const respondEmailAccount = typeof emailAccountResponder === "function" ? emailAccountResponder : () => emailAccountResponder;
  const respondUser = typeof userResponder === "function" ? userResponder : () => userResponder;
  return {
    client: {
      emailAccount: {
        findFirst: async (args) => {
          calls.push({ model: "emailAccount", args });
          return respondEmailAccount(args);
        }
      },
      user: {
        findFirst: async (args) => {
          calls.push({ model: "user", args });
          return respondUser(args);
        }
      }
    },
    getCapturedArgs: () => calls[calls.length - 1]?.args,
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

// EmailLead.owner is the DOE (Deal Originator Executive) attributed to this
// lead -- a plain name string, not a foreign key, since leads predate any
// per-employee ownership model. A DOE who has connected their own mailbox
// should never send under the shared admin identity by accident, same
// guarantee as the Channel Partner tier, just per-person.
test("falls back to the DOE's own active mailbox when nothing else matched", async () => {
  const doeMailbox = { id: "acct-doe-own", ownerId: "user-vimal" };
  const { client, getCallCount } = fakeClient(
    (args) => (args.where.country ? null : doeMailbox),
    { id: "user-vimal", name: "Vimal" }
  );
  const lead = { country: null, owner: "Vimal" };
  const campaign = { emailAccount: null }; // staff/admin-owned, no explicit assignment

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved.id, "acct-doe-own");
  assert.equal(getCallCount(), 2); // one user lookup, one mailbox lookup
});

test("does not use the DOE fallback when the lead's owner name matches no real employee", async () => {
  const { client } = fakeClient(null, null);
  const lead = { country: null, owner: "Someone Not On Staff" };
  const campaign = { emailAccount: null };

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved, null);
});

test("never uses the DOE fallback for a channel-partner-owned campaign, even if the lead has an owner name", async () => {
  const { client, getCallCount } = fakeClient(null, () => {
    throw new Error("should never look up a DOE user for a partner-owned campaign");
  });
  const lead = { country: null, owner: "Vimal" };
  const campaign = { ownerChannelPartnerId: "partner-1", emailAccount: null };

  const resolved = await resolveEmailAccount(lead, campaign, client);

  assert.equal(resolved, null);
  assert.equal(getCallCount(), 1); // only the partner's-own-mailbox check
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
