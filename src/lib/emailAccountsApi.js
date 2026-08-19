const API_BASE_URL = "http://localhost:4000/api/email-accounts";

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

export const emailAccountsApi = {
  list: () => request(""),
  // smtpPass is sent once to create the account (encrypted server-side
  // immediately) — it's never returned by any GET.
  create: (body) => request("", { method: "POST", body }),
  deactivate: (id) => request(`/${id}/deactivate`, { method: "POST" }),
  remove: (id) => request(`/${id}`, { method: "DELETE" })
};
