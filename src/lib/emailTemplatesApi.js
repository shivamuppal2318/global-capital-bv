import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/templates`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailTemplatesApi = {
  list: () => request(""),
  get: (key) => request(`/${key}`),
  // Upserts by key — persists the editable subject/body draft as a reusable
  // Template.
  save: (key, { subject, body }) => request(`/${key}`, { method: "PUT", body: { subject, body } }),
  // Renders the saved template with sample placeholder data (merge fields
  // filled, HTML wrapped/branded exactly like a real send).
  preview: (key) => request(`/${key}/preview`),
  remove: (key) => request(`/${key}`, { method: "DELETE" })
};
