import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/campaigns`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailCampaignsApi = {
  list: () => request(""),
  // Real aggregates for the Dashboard tab's chart/funnel/activity/mailbox
  // panels — one call instead of the frontend trying to reconstruct them
  // from the plain campaign list.
  dashboardSummary: () => request("/dashboard-summary"),
  systemStatus: () => request("/system-status"),
  testConnection: () => request("/test-connection", { method: "POST" }),
  // Create-only — no upsert-by-name. Calling this twice with the same name
  // creates two separate campaigns. Use update() to edit one already created.
  create: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  pause: (id) => request(`/${id}/pause`, { method: "POST" }),
  resume: (id) => request(`/${id}/resume`, { method: "POST" }),
  // Pass emailAccountId: null to clear the assignment and fall back to the
  // single global env-configured provider.
  assignEmailAccount: (id, emailAccountId) => request(`/${id}/email-account`, { method: "POST", body: { emailAccountId } }),
  // Sends this campaign's own composed subject/bodyHtml to its own leads,
  // optionally narrowed by a Segment. body: { segmentId?, scheduledAt?, delayBetweenMinutes? }
  sendNow: (id, body) => request(`/${id}/send-now`, { method: "POST", body }),
  // Real per-recipient status for this campaign's most recent blast sends
  // (sent/failed/pending, with the provider's own message id or error) —
  // lets the composer show "did it actually go out" without digging into a
  // lead's own activity timeline.
  recentSends: (id) => request(`/${id}/recent-sends`),
  // A campaign's real follow-up sequence — see routes/emailLeads.js's
  // scheduleCadenceSteps, which is what actually reads these when a lead
  // is added. Add-to-end/edit/delete only; no reordering yet.
  cadenceSteps: {
    list: (campaignId) => request(`/${campaignId}/cadence-steps`),
    create: (campaignId, body) => request(`/${campaignId}/cadence-steps`, { method: "POST", body }),
    update: (campaignId, stepId, body) => request(`/${campaignId}/cadence-steps/${stepId}`, { method: "PUT", body }),
    remove: (campaignId, stepId) => request(`/${campaignId}/cadence-steps/${stepId}`, { method: "DELETE" })
  }
};
