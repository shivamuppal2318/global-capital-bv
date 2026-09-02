import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/leads`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const leadsApi = {
  list: () => request(""),
  get: (id) => request(`/${id}`),
  create: (body) => request("", { method: "POST", body }),
  bulkCreate: (rows) => request("/bulk", { method: "POST", body: { rows } }),
  patch: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  sendPortalInvite: (id) => request(`/${id}/portal-invite`, { method: "POST" }),
  // Converts a cold-outreach EmailLead into a real CRM Lead and fires the
  // portal invite on it in the same step — see server/src/routes/leads.js.
  convertFromEmailLead: (emailLeadId) => request(`/from-email-lead/${emailLeadId}`, { method: "POST" }),
  // A short-lived (10 min) signed link to open in a new tab — see
  // routes/clientPortal.js's GET /preview/:leadId.
  clientPortalPreviewLink: (id) => request(`/${id}/client-portal/preview-link`, { method: "POST" }),
  // This one lead's real progress across the full deal lifecycle — see
  // server/src/lib/leadPipeline.js.
  pipeline: (id) => request(`/${id}/pipeline`),
  // How many of ALL leads have reached each stage — see the same file.
  pipelineSummary: () => request("/pipeline-summary"),
  // Kanban board — one column per stage, one card per lead in its current
  // stage. See the same file.
  dealBoard: () => request("/deal-board"),
  // A dated, chronological event list for one lead (Timeline tab) — see
  // server/src/lib/leadPipeline.js's computeLeadTimeline.
  timeline: (id) => request(`/${id}/timeline`),
  // Direct communications with this lead (Interactions tab) — Send Mail
  // sends and status changes, from LeadActivityLog.
  interactions: (id) => request(`/${id}/interactions`),
  // Free-text subject+body straight to this lead's email — the "Send
  // Mail" quick action.
  sendMail: (id, body) => request(`/${id}/send-mail`, { method: "POST", body }),
  // ZoomInfo company lookup by name — the "Enrich" quick action. Returns
  // {matched:false, message} when ZoomInfo has no confident match, rather
  // than an error, since that's a normal outcome for smaller/private
  // companies.
  enrich: (id) => request(`/${id}/enrich`, { method: "POST" }),
  // "Bulk Enrich" quick action — how many leads it would touch, then the
  // batch run itself. See server/src/routes/leads.js.
  enrichCandidatesCount: () => request("/enrich-candidates-count"),
  bulkEnrich: () => request("/bulk-enrich", { method: "POST" })
};
