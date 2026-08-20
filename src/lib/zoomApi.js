import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api`;

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
