import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/ai-agent`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailAiAgentApi = {
  // Whether a Claude key is actually configured (Admin Panel → AI
  // Assistant, or ANTHROPIC_API_KEY) — drives the tab's Enabled/Disabled
  // badge for real instead of a hardcoded "Disabled" string.
  status: () => request("/status"),
  listDrafts: (status) => request(status && status !== "All" ? `/drafts?status=${encodeURIComponent(status.toUpperCase())}` : "/drafts"),
  generate: (leadId) => request("/drafts/generate", { method: "POST", body: { leadId } }),
  send: (id) => request(`/drafts/${id}/send`, { method: "POST" }),
  skip: (id) => request(`/drafts/${id}/skip`, { method: "POST" }),
  discard: (id) => request(`/drafts/${id}`, { method: "DELETE" })
};
