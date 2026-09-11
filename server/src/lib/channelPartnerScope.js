// Name of the auto-created, unowned campaign every inbound website lead with
// no campaign specified lands in (see emailLeads.js's
// getOrCreateWebsiteLeadsCampaign) -- declared here, not there, so this file
// can reference it without an import cycle (emailLeads.js already imports
// ownerWhereClause from here).
export const WEBSITE_LEADS_CAMPAIGN_NAME = "Website Leads";

// The one place every Email Automation route decides what "only my own
// data" means. Admins see shared/admin staff campaigns; employees see the
// campaigns they created, plus the shared "Website Leads" list by name --
// it's a company-wide inbox nobody personally owns (ownerId is never set on
// it), not any one rep's private campaign, so it needs the same "shared
// resource stays visible to everyone" carve-out as the Data Room's
// null-lead template library. Channel Partners see the campaigns from their
// own portal account.
export function ownerWhereClause(req) {
  if (req.channelPartner) return { ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return { ownerChannelPartnerId: null, OR: [{ ownerId: req.user.id }, { name: WEBSITE_LEADS_CAMPAIGN_NAME }] };
}

// What owner fields a freshly-created EmailCampaign should carry.
export function ownerFieldsForCreate(req) {
  if (req.channelPartner) return { ownerId: null, ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return { ownerId: req.user.id, ownerChannelPartnerId: null };
}
