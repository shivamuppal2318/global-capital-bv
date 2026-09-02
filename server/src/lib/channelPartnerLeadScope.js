// Scopes CRM Workspace's `Lead` to only the ones a given Channel Partner
// actually referred, matching the existing (pre-existing, not introduced
// here) Lead.channelPartner <-> ChannelPartner.name string-match
// convention already used by channelPartners.js's withReferredLeads for
// commission calculation. Same additive-spread pattern as
// lib/channelPartnerScope.js's ownerWhereClause for Email Campaigns: {}
// (no-op) when req.channelPartner isn't set, so staff access is unaffected.
export function leadOwnerWhereClause(req) {
  return req.channelPartner ? { channelPartner: req.channelPartner.businessName } : {};
}
