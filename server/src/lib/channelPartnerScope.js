// The one place every Email Automation route that a Channel Partner can
// reach decides what "only my own data" actually means — a single spot so
// the scoping logic can't quietly drift between routes. Staff requests
// (req.channelPartner unset) get {} — no filter, full visibility, exactly
// today's behavior. A channel-partner request gets a real WHERE clause
// scoping to their own EmailCampaign.ownerChannelPartnerId.
export function ownerWhereClause(req) {
  return req.channelPartner ? { ownerChannelPartnerId: req.channelPartner.id } : {};
}

// What a freshly created EmailCampaign's ownerChannelPartnerId should be —
// their own id for a partner request, null (admin-owned) otherwise.
export function ownerIdForCreate(req) {
  return req.channelPartner?.id ?? null;
}
