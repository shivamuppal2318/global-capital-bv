// Optional Channel Partner Portal capabilities beyond the always-included
// Dashboard/Campaigns/Leads/Automation baseline (see the schema comment on
// ChannelPartnerUser.permissions for why those four aren't here: they're
// one shared API surface every portal account gets unconditionally, not
// separately gatable). Every id here passed two checks before being added:
// (1) its route has zero req.user dependency, so it can't crash on a
// channel-partner token, and (2) it queries only data that's either not
// company-wide-sensitive (Market Intelligence — MarketSignal rows are
// external market/news content, never client data) or has REAL per-partner
// scoping built (CRM Workspace, Data Room — see
// lib/channelPartnerLeadScope.js; read-only, matched via the existing
// Lead.channelPartner field, same convention channelPartners.js's
// withReferredLeads already uses for commission calc — Data Room also
// correctly excludes the general company-wide library, since a document
// with no leadId can't match a nested relation filter). Everything else
// stays out: Universal Filters, Executive Dashboard, WhatsApp Business and
// Channel Partner all query every lead/client/partner in the company with
// no per-partner filter today, so granting them would leak the whole
// company's data to one partner until they get the same real scoping
// treatment. NDA/IOI/Visit Planning/Ageing Report/Outreach-DOE now have it
// (same Lead.channelPartner / EmailCampaign.ownerChannelPartnerId
// mechanisms as CRM Workspace/Data Room/Email Automation already use).
export const CHANNEL_PARTNER_OPTIONAL_MODULES = [
  { id: "segments", label: "Segments", group: "Email Automation" },
  { id: "templates", label: "Templates", group: "Email Automation" },
  { id: "ai-agent", label: "AI Agent", group: "Email Automation" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" },
  { id: "leads", label: "Outreach / DOE", group: "Intelligence" },
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach" },
  { id: "data-room", label: "Data Room", group: "Relationships" },
  { id: "nda", label: "NDA", group: "Relationships" },
  { id: "ioi", label: "IOI", group: "Relationships" },
  { id: "visit-planning", label: "Visit Planning", group: "Relationships" },
  { id: "ageing-report", label: "Ageing Report", group: "Relationships" }
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
