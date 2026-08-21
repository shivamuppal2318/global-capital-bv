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
  testAiSettings: () => request("/ai-settings/test", { method: "POST" })
};
