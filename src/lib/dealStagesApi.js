import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/deal-stages`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const dealStagesApi = {
  catalogue: () => request("/catalogue"),
  summary: () => request("/summary"),
  list: ({ stage, status, q, leadId, owner } = {}) => {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (status && status !== "All") params.set("status", status);
    if (q) params.set("q", q);
    if (leadId) params.set("leadId", leadId);
    if (owner) params.set("owner", owner);
    const suffix = params.toString();
    return request(suffix ? `?${suffix}` : "");
  },
  // Upsert by [leadId, stage] — recording the same stage twice for a lead
  // updates it rather than creating a duplicate.
  save: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  remove: (id) => request(`/${id}`, { method: "DELETE" })
};
