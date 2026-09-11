import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerWhereClause } from "../src/lib/channelPartnerScope.js";
import { WEBSITE_LEADS_CAMPAIGN_NAME } from "../src/lib/websiteLeadsCampaign.js";

test("ownerWhereClause scopes a Channel Partner to only their own campaigns", () => {
  const req = { channelPartner: { id: "cp1" } };
  assert.deepEqual(ownerWhereClause(req), { ownerChannelPartnerId: "cp1" });
});

test("ownerWhereClause scopes an Admin to shared/ownerless campaigns", () => {
  const req = { user: { id: "u1", role: "ADMIN" } };
  assert.deepEqual(ownerWhereClause(req), { ownerId: null, ownerChannelPartnerId: null });
});

// Regression: a non-admin employee's campaign list used to be scoped
// strictly to campaigns they personally own, which meant the auto-created
// "Website Leads" inbox (ownerId: null, since real website leads land
// there regardless of who's logged in) was invisible to every employee
// except an Admin -- the "Website Lead" button in LeadsTab.jsx could never
// find it, so it always fell back to the API setup panel even once real
// leads had actually been captured.
test("ownerWhereClause still gives a non-admin employee their own campaigns, plus the shared Website Leads inbox", () => {
  const req = { user: { id: "u1", role: "EMPLOYEE" } };
  assert.deepEqual(ownerWhereClause(req), {
    OR: [
      { ownerId: "u1", ownerChannelPartnerId: null },
      { name: WEBSITE_LEADS_CAMPAIGN_NAME, ownerId: null, ownerChannelPartnerId: null }
    ]
  });
});

test("ownerWhereClause does not widen a non-admin employee's access to other ownerless legacy campaigns", () => {
  const req = { user: { id: "u1", role: "EMPLOYEE" } };
  const clause = ownerWhereClause(req);
  const ownerlessBranch = clause.OR.find((branch) => branch.ownerId === null);
  assert.equal(ownerlessBranch.name, WEBSITE_LEADS_CAMPAIGN_NAME);
});
