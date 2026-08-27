import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/leads`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const leadsApi = {
  list: () => request(""),
  get: (id) => request(`/${id}`),
  patch: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  sendPortalInvite: (id) => request(`/${id}/portal-invite`, { method: "POST" }),
  // This one lead's real progress across the full deal lifecycle — see
  // server/src/lib/leadPipeline.js.
  pipeline: (id) => request(`/${id}/pipeline`),
  // How many of ALL leads have reached each stage — see the same file.
  pipelineSummary: () => request("/pipeline-summary")
};
