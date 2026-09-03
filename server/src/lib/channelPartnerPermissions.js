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
// stays out: Executive Dashboard, WhatsApp Business and the Channel
// Partner screen itself — not just unfinished, each has a real structural
// reason it doesn't fit this recipe (see the plan doc): Executive
// Dashboard is a pure company-wide aggregate with no coherent "my slice"
// view; WhatsApp's Contact model has zero relation to Lead or
// ChannelPartner to filter by; the Channel Partner screen is a staff tool
// for administering every partner, not something a partner should see
// about themselves. Universal Filters/Zoom Call/Field Visit/Term Sheet now
// have real scoping (same Lead.channelPartner match as everything else
// here) alongside NDA/IOI/Visit Planning/Ageing Report/Outreach-DOE.
// Same items, same groups, same order as lib/permissions.js's employee
// MODULES list wherever the same feature-concept exists (Intelligence /
// CRM & Outreach / Relationships) — PermissionsEditor.jsx renders columns
// in first-seen order, so matching both the group names and this array's
// ordering is what makes the two Feature access panels lay out
// identically. "cold-bulk-mailing" is the exact same id/label Employees
// use for the whole Email Automation module (previously split into
// Segments/Templates/AI Agent as three separate grants here, unlike
// Employees' single checkbox — merged into one to match exactly; see
// app.js's three /api/email/* mounts, all now gated on this one id).
export const CHANNEL_PARTNER_OPTIONAL_MODULES = [
  { id: "universal-filters", label: "Universal Filters", group: "Intelligence" },
  { id: "market-intelligence", label: "Market Intelligence", group: "Intelligence" },
  { id: "leads", label: "Outreach / DOE", group: "Intelligence" },
  { id: "crm-workspace", label: "CRM Workspace", group: "CRM & Outreach" },
  { id: "cold-bulk-mailing", label: "Email Automation", group: "CRM & Outreach" },
  { id: "nda", label: "NDA", group: "Relationships" },
  { id: "meetings", label: "Zoom Call", group: "Relationships" },
  { id: "data-room", label: "Data Room", group: "Relationships" },
  { id: "ioi", label: "IOI", group: "Relationships" },
  { id: "visit-planning", label: "Visit Planning", group: "Relationships" },
  { id: "field-visit", label: "Field Visit", group: "Relationships" },
  { id: "term-sheet", label: "Term Sheet", group: "Relationships" },
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
