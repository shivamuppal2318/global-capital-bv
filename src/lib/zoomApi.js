import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const zoomApi = {
  getSettings: () => request("/zoom/settings"),
  updateSettings: (body) => request("/zoom/settings", { method: "PATCH", body }),
  testConnection: () => request("/zoom/settings/test", { method: "POST" })
};

export const meetingsApi = {
  list: () => request("/meetings"),
  create: (body) => request("/meetings", { method: "POST", body }),
  patch: (id, body) => request(`/meetings/${id}`, { method: "PATCH", body })
};
