import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api/email/leads`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
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
