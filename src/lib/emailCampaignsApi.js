import { API_ROOT } from "./config";
import { apiFetch, getToken } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/email/campaigns`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

// The download route needs the Authorization header, so it can't just be
// an <a href> — same reasoning as documentsApi.open/relationshipsApi's own
// downloadBlob.
async function downloadBlob(url) {
  const token = getToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? `Could not download that file (${response.status})`);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "download.csv";
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export const emailCampaignsApi = {
  list: () => request(""),
  // Real aggregates for the Dashboard tab's chart/funnel/activity/mailbox
  // panels — one call instead of the frontend trying to reconstruct them
  // from the plain campaign list.
  dashboardSummary: () => request("/dashboard-summary"),
  systemStatus: () => request("/system-status"),
  testConnection: () => request("/test-connection", { method: "POST" }),
  // Create-only — no upsert-by-name. Calling this twice with the same name
  // creates two separate campaigns. Use update() to edit one already created.
  create: (body) => request("", { method: "POST", body }),
  update: (id, body) => request(`/${id}`, { method: "PATCH", body }),
  // Only succeeds for an empty list/campaign (no leads ever enrolled) —
  // the backend refuses one with real leads/activity attached (409, "pause
  // it instead") rather than cascading the delete through their history.
  remove: (id) => request(`/${id}`, { method: "DELETE" }),
  pause: (id) => request(`/${id}/pause`, { method: "POST" }),
  resume: (id) => request(`/${id}/resume`, { method: "POST" }),
  // Pass emailAccountId: null to clear the assignment and fall back to the
  // single global env-configured provider.
  assignEmailAccount: (id, emailAccountId) => request(`/${id}/email-account`, { method: "POST", body: { emailAccountId } }),
  // Sends this campaign's own composed subject/bodyHtml to its own leads,
  // optionally narrowed by a Segment. body: { segmentId?, scheduledAt?, delayBetweenMinutes? }
  sendNow: (id, body) => request(`/${id}/send-now`, { method: "POST", body }),
  // Real per-recipient status for this campaign's most recent blast sends
  // (sent/failed/pending, with the provider's own message id or error) —
  // lets the composer show "did it actually go out" without digging into a
  // lead's own activity timeline.
  recentSends: (id) => request(`/${id}/recent-sends`),
  // Every real send this campaign has ever made (bulk CSV imports and
  // cadence follow-ups included, not just "last Send Now" blasts) --
  // matches the campaigns list's own "Emails Sent" count. Backs the list
  // view's per-campaign sent-leads popup.
  sentActivity: (id) => request(`/${id}/sent-activity`),
  activityDetail: (id) => request(`/${id}/activity-detail`),
  // Same per-recipient data as activityDetail above, as a real .csv download
  // (name/company/email, sent/opened/clicked counts, reply type, bounce/
  // unsubscribe flags, last activity) instead of a screen fetch.
  exportActivityCsv: (id) => downloadBlob(`${API_BASE_URL}/${id}/activity-detail/export.csv`),
  // Which leads make up the Dashboard's Opened/Clicked/Unsubscribed stat
  // cards. kind: "opened" | "clicked" | "unsubscribed".
  engagementDetail: (kind) => request(`/engagement-detail/${kind}`),
  // A campaign's real follow-up sequence — see routes/emailLeads.js's
  // scheduleCadenceSteps, which is what actually reads these when a lead
  // is added. Add-to-end/edit/delete only; no reordering yet.
  cadenceSteps: {
    list: (campaignId) => request(`/${campaignId}/cadence-steps`),
    create: (campaignId, body) => request(`/${campaignId}/cadence-steps`, { method: "POST", body }),
    update: (campaignId, stepId, body) => request(`/${campaignId}/cadence-steps/${stepId}`, { method: "PUT", body }),
    remove: (campaignId, stepId) => request(`/${campaignId}/cadence-steps/${stepId}`, { method: "DELETE" })
  }
};
