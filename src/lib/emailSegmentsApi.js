import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/segments`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailSegmentsApi = {
  // The real field/operator vocabulary lib/segmentMatching.js can evaluate
  // — fetched rather than hardcoded twice so the Conditions builder can
  // never drift out of sync with what the backend actually supports.
  fields: () => request("/fields"),
  list: () => request(""),
  get: (id) => request(`/${id}`),
  create: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PUT", body }),
  remove: (id) => request(`/${id}`, { method: "DELETE" })
};
