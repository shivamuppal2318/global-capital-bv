import { WEBSITE_LEADS_CAMPAIGN_NAME } from "./websiteLeadsCampaign.js";

// The one place every Email Automation route decides what "only my own
// data" means. Admins see shared/admin staff campaigns; employees see the
// campaigns they created; Channel Partners see the campaigns from their own
// portal account. Every employee additionally sees the one shared "Website
// Leads" inbox regardless of who's logged in -- it's an ownerless campaign
// by design (see getOrCreateWebsiteLeadsCampaign in emailLeads.js), and
// without this carve-out a non-admin employee could never see the real
// leads captured through the website webhook at all, even though nothing
// else about this scoping is meant to expose other employees' campaigns to
// them.
export function ownerWhereClause(req) {
  if (req.channelPartner) return { ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return {
    OR: [
      { ownerId: req.user.id, ownerChannelPartnerId: null },
      { name: WEBSITE_LEADS_CAMPAIGN_NAME, ownerId: null, ownerChannelPartnerId: null }
    ]
  };
}

// What owner fields a freshly-created EmailCampaign should carry.
export function ownerFieldsForCreate(req) {
  if (req.channelPartner) return { ownerId: null, ownerChannelPartnerId: req.channelPartner.id };
  if (req.user?.role === "ADMIN") return { ownerId: null, ownerChannelPartnerId: null };
  return { ownerId: req.user.id, ownerChannelPartnerId: null };
}
