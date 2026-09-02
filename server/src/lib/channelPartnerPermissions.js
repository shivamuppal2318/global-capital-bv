// Optional Channel Partner Portal capabilities beyond the always-included
// Dashboard/Campaigns/Leads/Automation baseline (see the schema comment on
// ChannelPartnerUser.permissions for why those four aren't here: they're
// one shared API surface every portal account gets unconditionally, not
// separately gatable). Every id here passed two checks before being added:
// (1) its route has zero req.user dependency, so it can't crash on a
// channel-partner token, and (2) it queries only data that's either not
// company-wide-sensitive (Market Intelligence — MarketSignal rows are
// external market/news content, never client data) or has REAL per-partner
// scoping built (CRM Workspace — see lib/channelPartnerLeadScope.js;
// read-only, matched via the existing Lead.channelPartner field, same
// convention channelPartners.js's withReferredLeads already uses for
// commission calc). Everything else stays out: NDA, IOI, Universal
// Filters, Outreach/DOE, Data Room, Visit Planning, Executive Dashboard,
// WhatsApp Business and Channel Partner all query every lead/client/
// partner in the company with no per-partner filter today, so granting
// them would leak the whole company's data to one partner until they get
// the same real scoping treatment as CRM Workspace.
export const CHANNEL_PARTNER_OPTIONAL_MODULES = [
  { id: "segments", label: "Segments", group: "Email Automation" },
  { id: "templates", label: "Templates", group: "Email Automation" },
  { id: "ai-agent", label: "AI Agent", group: "Email Automation" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" },
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach" }
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
