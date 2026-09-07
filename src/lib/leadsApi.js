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
  bulkEnrich: () => request("/bulk-enrich", { method: "POST" }),
  // Real ZoomInfo prospecting search — "Find Companies (ZoomInfo)" panel.
  // mode: "companies" | "contacts". Nothing is persisted server-side;
  // the caller pre-fills the New Record form from a chosen result.
  zoomInfoSearch: ({ mode, filters, page }) => request("/zoominfo-search", { method: "POST", body: { mode, filters, page } }),
  // A Contact search result only ever carries a hasEmail-style flag, never
  // the real address — this fetches it via a real Enrich lookup, spent only
  // for a result the rep actually picked ("Add as Lead"), not every row.
  zoomInfoRevealContact: ({ firstName, lastName, companyName }) =>
    request("/zoominfo-search/reveal-contact", { method: "POST", body: { firstName, lastName, companyName } }),
  // For "Add to List" on a bare Companies-mode search result (no person to
  // reveal an email for) — finds a real contact at that company first, then
  // returns their real email. { found: false } when ZoomInfo has no contact
  // on file for that company, rather than an error.
  zoomInfoFindCompanyContact: (companyName) =>
    request("/zoominfo-search/find-company-contact", { method: "POST", body: { companyName } }),
  // Country/state search filters only accept exact values from ZoomInfo's
  // own controlled vocabulary (confirmed live) — this backs a real dropdown
  // instead of a free-text field. field: "countries" | "states".
  zoomInfoLookup: (field) => request(`/zoominfo-search/lookup/${field}`)
};
