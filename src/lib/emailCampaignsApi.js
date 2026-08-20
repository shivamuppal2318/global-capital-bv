import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api/email/campaigns`;

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

export const emailCampaignsApi = {
  list: () => request(""),
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
