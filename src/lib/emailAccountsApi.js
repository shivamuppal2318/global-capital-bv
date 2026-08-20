import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email-accounts`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const emailAccountsApi = {
  list: () => request(""),
  get: (id) => request(`/${id}`),
  // smtpPass is sent once to create the account (encrypted server-side
  // immediately) — it's never returned by any GET.
  create: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PUT", body }),
  test: (id) => request(`/${id}/test`, { method: "POST" }),
  deactivate: (id) => request(`/${id}/deactivate`, { method: "POST" }),
  remove: (id) => request(`/${id}`, { method: "DELETE" })
};
