const API_BASE_URL = "http://localhost:4000/api/leads";

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

export const leadsApi = {
  list: () => request(""),
  get: (id) => request(`/${id}`),
  patch: (id, body) => request(`/${id}`, { method: "PATCH", body })
};
