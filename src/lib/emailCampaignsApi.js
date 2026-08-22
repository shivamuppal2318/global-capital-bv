import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/campaigns`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailCampaignsApi = {
  list: () => request(""),
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
  assignEmailAccount: (id, emailAccountId) => request(`/${id}/email-account`, { method: "POST", body: { emailAccountId } })
};
