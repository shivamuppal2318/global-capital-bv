import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/leads`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const leadsApi = {
  list: () => request(""),
  get: (id) => request(`/${id}`),
  patch: (id, body) => request(`/${id}`, { method: "PATCH", body })
};
