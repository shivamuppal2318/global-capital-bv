import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api/email/templates`;

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
