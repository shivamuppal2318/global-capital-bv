import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/admin`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const adminApi = {
  listEmployees: () => request("/employees"),
  // Returns { ...employee, temporaryPassword } — temporaryPassword is only
  // ever present in this one response; there is no way to view it again.
  createEmployee: (body) => request("/employees", { method: "POST", body }),
  updateEmployee: (id, body) => request(`/employees/${id}`, { method: "PATCH", body }),
  resetPassword: (id) => request(`/employees/${id}/reset-password`, { method: "POST" }),
  removeEmployee: (id) => request(`/employees/${id}`, { method: "DELETE" }),
  // Grantable modules come from the backend so the checkbox list can't
  // drift from what the API actually enforces.
  listModules: () => request("/modules"),
  getSystemEmail: () => request("/system-email"),
  saveSystemEmail: (body) => request("/system-email", { method: "PUT", body }),
  // Omit `to` to only verify the credentials without sending anything.
  testSystemEmail: (to) => request("/system-email/test", { method: "POST", body: { to } }),
  // The Claude key is never returned — only hasKey / a masked preview and
  // which source (database vs env var) is currently in effect.
  getAiSettings: () => request("/ai-settings"),
  saveAiSettings: (body) => request("/ai-settings", { method: "PUT", body }),
  testAiSettings: () => request("/ai-settings/test", { method: "POST" }),
  removeAiKey: () => request("/ai-settings", { method: "DELETE" }),
  // Knowledge base = the pinned subset of Data Room documents, so this
  // lists everything and pinning promotes an existing file rather than
  // needing a second upload.
  listAiKnowledge: () => request("/ai-knowledge"),
  pinAiDocument: (id, pinned) => request(`/ai-knowledge/${id}/pin`, { method: "POST", body: { pinned } }),
  // Market Intelligence's data-source keys (Exa, NewsAPI.ai, Firecrawl,
  // Apollo) — same never-returned-key / hasKey+preview+source shape as AI
  // settings above, one provider at a time.
  // ZoomInfo GTM API credentials for CRM Workspace's "Enrich" action — same
  // never-returned-secret / hasClientSecret shape as AI settings above.
  getZoomInfoSettings: () => request("/zoominfo-settings"),
  saveZoomInfoSettings: (body) => request("/zoominfo-settings", { method: "PUT", body }),
  testZoomInfoSettings: () => request("/zoominfo-settings/test", { method: "POST" }),
  getMarketIntelSettings: () => request("/market-intelligence-settings"),
  saveMarketIntelProviderKey: (provider, apiKey) => request(`/market-intelligence-settings/${provider}`, { method: "PUT", body: { apiKey } }),
  testMarketIntelProvider: (provider) => request(`/market-intelligence-settings/${provider}/test`, { method: "POST" }),
  removeMarketIntelProviderKey: (provider) => request(`/market-intelligence-settings/${provider}`, { method: "DELETE" }),
  // Admin-editable points behind a market signal's relevanceScore — see
  // server/src/lib/scoringCriteria.js.
  getScoringCriteria: () => request("/scoring-criteria"),
  updateScoringCriterionPoints: (key, points) => request(`/scoring-criteria/${key}`, { method: "PATCH", body: { points } }),
  // Who did what, when — see server/src/lib/auditLog.js. `action` filters by
  // prefix (e.g. "employee." matches every employee.* row).
  auditLogs: ({ page = 1, pageSize = 25, action } = {}) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (action) params.set("action", action);
    return request(`/audit-logs?${params.toString()}`);
  },
  auditLogActions: () => request("/audit-logs/actions")
};
