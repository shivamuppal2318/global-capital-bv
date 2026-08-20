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
  removeEmployee: (id) => request(`/employees/${id}`, { method: "DELETE" })
};
