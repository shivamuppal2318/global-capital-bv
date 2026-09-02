// Optional Channel Partner Portal capabilities beyond the always-included
// Dashboard/Campaigns/Leads/Automation baseline (see the schema comment on
// ChannelPartnerUser.permissions for why those four aren't here: they're
// one shared API surface every portal account gets unconditionally, not
// separately gatable). Every id here passed two checks before being added:
// (1) its route has zero req.user dependency, so it can't crash on a
// channel-partner token, and (2) it queries only data that isn't
// company-wide-sensitive/unscoped -- most staff modules fail (2): NDA,
// IOI, CRM Workspace, Universal Filters, Outreach/DOE, Data Room, Visit
// Planning, Executive Dashboard, WhatsApp Business and Channel Partner all
// query every lead/client/partner in the company with no per-partner
// filter, so granting them would leak the whole company's data to one
// partner -- real per-partner scoping (like EmailCampaign.
// ownerChannelPartnerId already has) would be required first, and isn't
// built. Market Intelligence is the one exception: MarketSignal rows are
// external market/news content, never company-confidential client data.
export const CHANNEL_PARTNER_OPTIONAL_MODULES = [
  { id: "segments", label: "Segments", group: "Email Automation" },
  { id: "templates", label: "Templates", group: "Email Automation" },
  { id: "ai-agent", label: "AI Agent", group: "Email Automation" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" }
];

export const CHANNEL_PARTNER_OPTIONAL_MODULE_IDS = CHANNEL_PARTNER_OPTIONAL_MODULES.map((m) => m.id);

// Drops ids that no longer exist -- same reasoning as lib/permissions.js's
// liveModules for staff.
export function liveChannelPartnerModules(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((id) => CHANNEL_PARTNER_OPTIONAL_MODULE_IDS.includes(id));
}

export function hasChannelPartnerModule(channelPartner, moduleId) {
  return Array.isArray(channelPartner?.permissions) && channelPartner.permissions.includes(moduleId);
}
