import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/leads`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailLeadsApi = {
  list: (campaignId) => request(campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ""),
  create: (body) => request("", { method: "POST", body }),
  // `leads` is already-parsed structured rows (see lib/csvLeads.js) — posts
  // them as JSON rather than raw CSV text, so validation/preview happens
  // client-side before anything reaches the database.
  bulkCreate: (campaignId, leads) => request("/bulk", { method: "POST", body: { campaignId, leads } }),
  activity: (id) => request(`/${id}/activity`),
  // Sends by resolving a saved Template server-side (merge fields, branded
  // HTML, unsubscribe link all applied automatically).
  sendTemplate: (id, templateKey) => request(`/${id}/send-template`, { method: "POST", body: { templateKey } }),
  send: (id, { subject, body }) => request(`/${id}/send`, { method: "POST", body: { subject, body } }),
  // Classifies textBody exactly like a real inbound reply would (same
  // rules as the auto-responder), via the authenticated equivalent of the
  // inbound-email webhook.
  simulateReply: (id, textBody) => request(`/${id}/simulate-reply`, { method: "POST", body: { textBody } })
};
