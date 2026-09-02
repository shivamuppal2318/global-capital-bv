// Optional Channel Partner Portal capabilities beyond the always-included
// Dashboard/Campaigns/Leads/Automation baseline (see the schema comment on
// ChannelPartnerUser.permissions for why those four aren't here: they're
// one shared API surface every portal account gets unconditionally, not
// separately gatable). Only modules confirmed to have zero req.user
// dependency (see app.js) are safe to expose to a channel-partner token —
// Mailbox (emailAccounts.js) is deeply staff-ownership-dependent and stays
// out of scope.
export const CHANNEL_PARTNER_OPTIONAL_MODULES = [
  { id: "segments", label: "Segments", group: "Email Automation" },
  { id: "templates", label: "Templates", group: "Email Automation" },
  { id: "ai-agent", label: "AI Agent", group: "Email Automation" }
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
