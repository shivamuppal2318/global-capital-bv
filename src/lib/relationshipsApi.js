import { API_ROOT } from "./config";
import { apiFetch, getToken } from "./apiFetch";

// Clients for the three modules that outgrew the shared deal-stage table:
// NDA tracking, Zoom call capture and visit planning.

function qs(params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v && v !== "All") search.set(k, v);
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

// The download route needs the Authorization header, so it can't just be
// an <a href> — same reasoning as documentsApi.open. Used for the "filled
// template" fallback (signed-document) when a record was accepted online
// rather than by uploading a real file.
async function downloadBlob(url) {
  const token = getToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Could not download that file (${response.status})`);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "document";
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

const ndaBase = `${API_ROOT}/api/nda-records`;

export const ndaApi = {
  list: (filters) => apiFetch(`${ndaBase}${qs(filters)}`),
  metrics: () => apiFetch(`${ndaBase}/metrics`),
  save: (body) => apiFetch(ndaBase, { method: "POST", body }),
  // Advances the flow and stamps the matching timestamp server-side, so the
  // UI never has to know which date field a given step writes.
  advance: (id, action) => apiFetch(`${ndaBase}/${id}/${action}`, { method: "POST" }),
  update: (id, body) => apiFetch(`${ndaBase}/${id}`, { method: "PATCH", body }),
  remove: (id) => apiFetch(`${ndaBase}/${id}`, { method: "DELETE" }),
  downloadSignedDocument: (id) => downloadBlob(`${ndaBase}/${id}/signed-document`)
};

const visitBase = `${API_ROOT}/api/visit-plans`;

export const visitPlansApi = {
  list: (filters) => apiFetch(`${visitBase}${qs(filters)}`),
  metrics: () => apiFetch(`${visitBase}/metrics`),
  calendar: () => apiFetch(`${visitBase}/calendar`),
  create: (body) => apiFetch(visitBase, { method: "POST", body }),
  update: (id, body) => apiFetch(`${visitBase}/${id}`, { method: "PATCH", body }),
  remove: (id) => apiFetch(`${visitBase}/${id}`, { method: "DELETE" })
};

const ioiBase = `${API_ROOT}/api/ioi-records`;

export const ioiApi = {
  list: (filters) => apiFetch(`${ioiBase}${qs(filters)}`),
  metrics: () => apiFetch(`${ioiBase}/metrics`),
  // NDA -> Zoom -> Data room -> IOI -> Term sheet, counted across modules.
  funnel: () => apiFetch(`${ioiBase}/funnel`),
  save: (body) => apiFetch(ioiBase, { method: "POST", body }),
  advance: (id, action) => apiFetch(`${ioiBase}/${id}/${action}`, { method: "POST" }),
  update: (id, body) => apiFetch(`${ioiBase}/${id}`, { method: "PATCH", body }),
  remove: (id) => apiFetch(`${ioiBase}/${id}`, { method: "DELETE" }),
  downloadSignedDocument: (id) => downloadBlob(`${ioiBase}/${id}/signed-document`)
};

const channelPartnersBase = `${API_ROOT}/api/channel-partners`;

export const channelPartnersApi = {
  list: (filters) => apiFetch(`${channelPartnersBase}${qs(filters)}`),
  metrics: () => apiFetch(`${channelPartnersBase}/metrics`),
  create: (body) => apiFetch(channelPartnersBase, { method: "POST", body }),
  update: (id, body) => apiFetch(`${channelPartnersBase}/${id}`, { method: "PATCH", body }),
  remove: (id) => apiFetch(`${channelPartnersBase}/${id}`, { method: "DELETE" }),
  // The standard tiered incentive schedule (Clause 7.3 of the Channel
  // Partner Agreement) and a real per-deal calculator against it — see
  // server/src/lib/channelPartnerCommission.js.
  commissionTiers: () => apiFetch(`${channelPartnersBase}/commission-tiers`),
  estimateCommission: (id, borrowingAmount) =>
    apiFetch(`${channelPartnersBase}/${id}/estimate-commission?borrowingAmount=${encodeURIComponent(borrowingAmount)}`),
  // Real signed link to the public agreement-signing page (routes/
  // channelPartnerAgreement.js) — copy it and send it to the partner
  // however you want; nothing auto-sends.
  agreementLink: (id) => apiFetch(`${channelPartnersBase}/${id}/agreement-link`),
  // What this partner has actually done with their own Channel Partner
  // Portal login (separate from referredLeads above, which matches
  // Lead.channelPartner by name) — see server/src/routes/channelPartners.js.
  activity: (id) => apiFetch(`${channelPartnersBase}/${id}/activity`),
  portalLoginLink: (id) => apiFetch(`${channelPartnersBase}/${id}/portal-login-link`, { method: "POST" }),
  optionalModules: () => apiFetch(`${channelPartnersBase}/optional-modules`),
  // Every Channel Partner Portal login, for Admin Panel -> Channel
  // Partners (the same home Employees has for staff logins).
  portalUsers: () => apiFetch(`${channelPartnersBase}/portal-users`),
  updatePortalUser: (id, body) => apiFetch(`${channelPartnersBase}/portal-users/${id}`, { method: "PATCH", body }),
  resetPortalUserPassword: (id) => apiFetch(`${channelPartnersBase}/portal-users/${id}/reset-password`, { method: "POST" })
};

const meetingsBase = `${API_ROOT}/api/meetings`;

export const callsApi = {
  list: () => apiFetch(meetingsBase),
  metrics: () => apiFetch(`${meetingsBase}/metrics`),
  update: (id, body) => apiFetch(`${meetingsBase}/${id}`, { method: "PATCH", body }),
  summarise: (id) => apiFetch(`${meetingsBase}/${id}/summarise`, { method: "POST" }),
  // Manual fallback for the automatic recording.completed webhook — pulls
  // Zoom's own Cloud Recording transcript and AI-summarizes it in one call.
  // See server/src/lib/zoomTranscriptProcessor.js.
  fetchTranscript: (id) => apiFetch(`${meetingsBase}/${id}/fetch-transcript`, { method: "POST" })
};
