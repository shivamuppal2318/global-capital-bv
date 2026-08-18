const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";
// NOTE: this ships in the built JS bundle, visible to anyone who opens
// devtools — a Vite env var can't hold a real secret. It's enough to keep
// the API off the open internet from random bots, not to stop a user of
// this app from extracting the key themselves. A real deployment needs a
// per-user session/token issued after login, not a single shared key baked
// into the frontend.
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, ...options?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed with ${response.status}`);
  }
  // 204 No Content (e.g. DELETE) has no body — .json() would throw trying
  // to parse an empty string.
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

// Sends the branch email for a lead through the real backend (Prisma +
// email provider). Callers are expected to catch failures — the backend
// isn't guaranteed to be running (or migrated with a live database) in
// every environment this app runs in, and the UI should fall back to its
// local simulation rather than break when it's not.
export function sendLeadEmail(leadId, { subject, body }) {
  return request(`/leads/${leadId}/send`, {
    method: "POST",
    body: JSON.stringify({ subject, body })
  });
}

export function fetchLeadActivity(leadId) {
  return request(`/leads/${leadId}/activity`, { method: "GET" });
}

// Persists the editable subject/body draft as a reusable Template, keyed by
// reply type ("interested", "zoom-request", ...). Without this, edits made
// in the UI only ever lived in local useState and vanished on refresh.
export function saveTemplate(key, { subject, body }) {
  return request(`/templates/${key}`, {
    method: "PUT",
    body: JSON.stringify({ subject, body })
  });
}

export function fetchTemplate(key) {
  return request(`/templates/${key}`, { method: "GET" });
}

export function fetchTemplates() {
  return request(`/templates`, { method: "GET" });
}

// Renders the saved template with sample placeholder data (merge fields
// filled, HTML wrapped/branded exactly like a real send) — lets the UI
// show what the email actually looks like before anything goes to a real
// lead.
export function fetchTemplatePreview(key) {
  return request(`/templates/${key}/preview`, { method: "GET" });
}

export function deleteTemplate(key) {
  return request(`/templates/${key}`, { method: "DELETE" });
}

// Sends by resolving a saved Template server-side (merge fields, branded
// HTML, unsubscribe link all applied automatically) instead of shipping
// already-final subject/body text. Preferred over sendLeadEmail when a
// template exists for the current reply type.
export function sendLeadTemplateEmail(leadId, templateKey) {
  return request(`/leads/${leadId}/send-template`, {
    method: "POST",
    body: JSON.stringify({ templateKey })
  });
}

export function fetchCampaigns() {
  return request(`/campaigns`, { method: "GET" });
}

// Backend POST /campaigns is create-only — no upsert-by-name. Calling this
// twice with the same name creates two separate campaigns, it doesn't
// update the first one (campaign.name isn't a unique constraint). Use
// updateCampaign() below to edit an already-created campaign in place
// instead of calling this again with the same name.
export function createCampaign({ name, audience, template, dailyLimit, delayDays, followUpCount, abTest, autoPause }) {
  return request(`/campaigns`, {
    method: "POST",
    body: JSON.stringify({ name, audience, template, dailyLimit, delayDays, followUpCount, abTest, autoPause })
  });
}

// Edits settings on a campaign that's already been created — this is what
// "Save automation" now calls when the selected campaign's name matches the
// form (i.e. the user is tweaking an existing campaign, not starting a new
// one), instead of always POSTing a duplicate. Name isn't editable here —
// see the route's comment for why.
export function updateCampaign(campaignId, { audience, template, dailyLimit, delayDays, followUpCount, abTest, autoPause }) {
  return request(`/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ audience, template, dailyLimit, delayDays, followUpCount, abTest, autoPause })
  });
}

export function pauseCampaign(campaignId) {
  return request(`/campaigns/${campaignId}/pause`, { method: "POST" });
}

export function resumeCampaign(campaignId) {
  return request(`/campaigns/${campaignId}/resume`, { method: "POST" });
}

export function fetchLeads(campaignId) {
  const query = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
  return request(`/leads${query}`, { method: "GET" });
}

export function createLead({ name, company, email, owner, campaignId }) {
  return request(`/leads`, {
    method: "POST",
    body: JSON.stringify({ name, company, email, owner, campaignId })
  });
}

// `leads` is already-parsed structured rows (see lib/csvLeads.js) — this
// posts them as JSON rather than raw CSV text, so validation/preview
// happens client-side before anything reaches the database.
export function bulkCreateLeads(campaignId, leads) {
  return request(`/leads/bulk`, {
    method: "POST",
    body: JSON.stringify({ campaignId, leads })
  });
}

export function fetchEmailAccounts() {
  return request(`/email-accounts`, { method: "GET" });
}

// smtpPass is sent once to create the account (encrypted server-side
// immediately, see lib/credentialCrypto.js) — it's never returned by any
// GET, so there's no "load the account back with its password" flow.
export function createEmailAccount({ label, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress, dailyLimit }) {
  return request(`/email-accounts`, {
    method: "POST",
    body: JSON.stringify({ label, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress, dailyLimit })
  });
}

export function deactivateEmailAccount(id) {
  return request(`/email-accounts/${id}/deactivate`, { method: "POST" });
}

export function deleteEmailAccount(id) {
  return request(`/email-accounts/${id}`, { method: "DELETE" });
}

// Pass emailAccountId: null to clear the assignment and fall back to the
// single global env-configured provider.
export function assignCampaignEmailAccount(campaignId, emailAccountId) {
  return request(`/campaigns/${campaignId}/email-account`, {
    method: "POST",
    body: JSON.stringify({ emailAccountId })
  });
}

export function fetchMarketIntelligenceStatus() {
  return request(`/market-intelligence/status`, { method: "GET" });
}

export function runMarketIntelligencePipeline({ query, defaultCampaignId } = {}) {
  return request(`/market-intelligence/run`, {
    method: "POST",
    body: JSON.stringify({ query, defaultCampaignId })
  });
}

export function fetchMarketSignals() {
  return request(`/market-intelligence/signals`, { method: "GET" });
}

// Classifies textBody exactly like a real inbound reply would (same rules
// as the UI's chips), via the authenticated equivalent of the inbound-email
// webhook — see the comment on POST /leads/:id/simulate-reply server-side
// for why this is a separate route from the real webhook.
export function simulateReply(leadId, textBody) {
  return request(`/leads/${leadId}/simulate-reply`, {
    method: "POST",
    body: JSON.stringify({ textBody })
  });
}
