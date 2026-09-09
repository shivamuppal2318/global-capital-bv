// The one place every Email Automation route decides what "only my own
// data" means. Admins see shared/admin staff campaigns; employees see the
// campaigns they created; Channel Partners see the campaigns from their own
// portal account.
export function ownerWhereClause(req) {
  if (req.channelPartner) return { ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return { ownerId: req.user.id, ownerChannelPartnerId: null };
}

// What owner fields a freshly-created EmailCampaign should carry.
export function ownerFieldsForCreate(req) {
  if (req.channelPartner) return { ownerId: null, ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return { ownerId: req.user.id, ownerChannelPartnerId: null };
}
