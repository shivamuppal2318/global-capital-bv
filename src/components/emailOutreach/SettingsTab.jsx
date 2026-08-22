import { useEffect, useState } from "react";
import { ActionButton } from "../ui.jsx";
import { PlusIcon, CogIcon, ZapIcon, CheckCircleIcon, LinkIcon, CopyIcon, RefreshIcon } from "../Icons.jsx";
import { api } from "../../lib/api.js";

// Mailbox (SMTP account) management — separated out from Campaigns so
// adding/rotating sending mailboxes doesn't compete for space with the
// campaign list and lead intake.
export function SettingsTab({ mailing }) {
  const {
    emailAccounts, newAccountForm, setNewAccountForm, handleAddEmailAccount, handleDeactivateAccount, automationNotice,
    systemStatus, testConnectionResult, handleTestConnection, selectedCampaign
  } = mailing;

  // Same API key as WhatsApp Business → Settings → Integrations & API (one
  // key, both webhooks — see server/src/app.js) — only the endpoint path
  // and required fields differ for this domain (a campaign to enroll into).
  const [integration, setIntegration] = useState(null);
  const [integrationError, setIntegrationError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api
      .get("/settings/integrations")
      .then(setIntegration)
      .catch((err) => setIntegrationError(err.message));
  }, []);

  const emailWebhookUrl = integration?.webhookUrl.replace("/api/leads/inbound", "/api/email/leads/inbound");

  async function handleCopy(label, value) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function handleRegenerateKey() {
    setRegenerating(true);
    try {
      const result = await api.post("/settings/integrations/regenerate-key");
      setIntegration((current) => ({ ...current, apiKey: result.apiKey }));
    } finally {
      setRegenerating(false);
    }
  }

  const curlExample = integration
    ? `curl -X POST ${emailWebhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${integration.apiKey}" \\
  -d '{
    "full_name": "Marco Reyes",
    "email": "marco@example.com",
    "company": "Sunridge Capital",
    "campaign": "${selectedCampaign?.name ?? "Your campaign name"}"
  }'`
    : "";

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <ZapIcon className="size-5 text-[#f29b3a]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">System status</h2>
        </div>
        <p className="mt-1 pl-8 text-[14px] text-[#5f6f89]">What's actually configured on the server right now — set via environment variables, not from this UI.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[14px] border border-[#e7edf5] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-[#102246]">Email sending</p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  systemStatus?.emailProvider === "smtp" ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                }`}
              >
                {systemStatus ? (systemStatus.emailProvider === "smtp" ? "SMTP configured" : `${systemStatus.emailProvider} mode`) : "Checking…"}
              </span>
            </div>
            {systemStatus?.emailProvider === "smtp" ? (
              <p className="mt-2 text-[12px] text-[#6a7790]">
                {systemStatus.smtpHost} · sending as {systemStatus.smtpFromAddress}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-[#6a7790]">Emails are only logged to the server console, not delivered.</p>
            )}
            {systemStatus?.emailProvider === "smtp" ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testConnectionResult?.pending}
                  className="rounded-[10px] border border-[#d6deea] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#3046b2] transition hover:bg-[#f4f7fb] disabled:opacity-50"
                >
                  {testConnectionResult?.pending ? "Testing…" : "Test connection"}
                </button>
                {testConnectionResult && !testConnectionResult.pending ? (
                  <p className={`mt-2 flex items-start gap-1.5 text-[12px] ${testConnectionResult.success ? "text-[#2b9b60]" : "text-[#c94b6b]"}`}>
                    {testConnectionResult.success ? <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0" /> : null}
                    {testConnectionResult.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[14px] border border-[#e7edf5] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-[#102246]">Automatic follow-ups</p>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  systemStatus?.queueEnabled ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                }`}
              >
                {systemStatus ? (systemStatus.queueEnabled ? "Running" : "Not running") : "Checking…"}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#6a7790]">
              {systemStatus?.queueEnabled
                ? "Scheduled follow-up emails are sent automatically."
                : "Leads are saved, but scheduled follow-ups won't fire until REDIS_URL is configured."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <LinkIcon className="size-5 text-[#3046b2]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Lead ingestion API</h2>
        </div>
        <p className="mt-1 pl-8 text-[14px] text-[#5f6f89]">
          A website form, ad platform, Zapier, or a custom script can POST a lead directly into a named campaign's follow-up
          sequence. Same API key as WhatsApp Business → Settings → Integrations & API — only the endpoint and fields differ.
        </p>

        {integrationError ? (
          <p className="mt-4 text-[13px] text-[#c94b6b]">{integrationError}</p>
        ) : !integration ? (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Webhook / API endpoint</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={emailWebhookUrl}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f7f9fc] px-3.5 py-2.5 font-mono text-[13px] text-[#102246] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy("url", emailWebhookUrl)}
                  className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                >
                  <CopyIcon className="size-4" />
                </button>
              </div>
              {copied === "url" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">API key</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={integration.apiKey}
                  className="w-full rounded-[12px] border border-[#d6deea] bg-[#f7f9fc] px-3.5 py-2.5 font-mono text-[13px] text-[#102246] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy("key", integration.apiKey)}
                  className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                >
                  <CopyIcon className="size-4" />
                </button>
                <ActionButton label={regenerating ? "Regenerating…" : "Regenerate"} icon={RefreshIcon} small onClick={handleRegenerateKey} />
              </div>
              {copied === "key" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
              <p className="mt-1 text-[12px] text-[#c47f1a]">
                Shared with the WhatsApp lead webhook — regenerating breaks both, not just this one.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Example request</label>
              <pre className="overflow-x-auto rounded-[14px] bg-[#0f2042] px-4 py-3 text-[12px] leading-6 text-[#dfe6f7]">
                <code>{curlExample}</code>
              </pre>
              <p className="mt-2 text-[12px] text-[#6a7790]">
                Required: <code className="rounded bg-[#f0f3f9] px-1 py-0.5">name</code> (or full_name/lead_name),{" "}
                <code className="rounded bg-[#f0f3f9] px-1 py-0.5">email</code>, and either{" "}
                <code className="rounded bg-[#f0f3f9] px-1 py-0.5">campaign</code> (name) or{" "}
                <code className="rounded bg-[#f0f3f9] px-1 py-0.5">campaign_id</code>. Optional:{" "}
                <code className="rounded bg-[#f0f3f9] px-1 py-0.5">company</code>,{" "}
                <code className="rounded bg-[#f0f3f9] px-1 py-0.5">owner</code>. A duplicate email in the same campaign is
                rejected (409) instead of double-enrolling them in the cadence. An email whose domain has no real mail
                servers (checked via DNS, not just format) is rejected too (422) — so only deliverable-looking addresses
                ever enter a campaign's cadence.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <CogIcon className="size-5 text-[#5f6f89]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Sending mailboxes</h2>
        </div>
        <p className="mt-1 pl-8 text-[14px] text-[#5f6f89]">
          Register as many SMTP accounts as you need; assign one to a campaign from the Campaigns tab (or leave it on the default).
        </p>

        {emailAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {emailAccounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e7edf5] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[#102246]">{account.label}</p>
                  <p className="truncate text-[12px] text-[#6a7790]">
                    {account.fromAddress} · {account.smtpHost} · {account.dailyLimit}/day
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      account.isActive ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                    }`}
                  >
                    {account.isActive ? "Active" : "Inactive"}
                  </span>
                  {account.isActive ? (
                    <button
                      type="button"
                      onClick={() => handleDeactivateAccount(account.id)}
                      className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#9aa6ba]">No mailboxes added yet — add one below.</p>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            placeholder="Label (e.g. Rahul's mailbox)"
            value={newAccountForm.label}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, label: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="From address"
            type="email"
            value={newAccountForm.fromAddress}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, fromAddress: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP host"
            value={newAccountForm.smtpHost}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpHost: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="Port (e.g. 465 or 587)"
            value={newAccountForm.smtpPort}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPort: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP username"
            value={newAccountForm.smtpUser}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpUser: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="SMTP password"
            type="password"
            value={newAccountForm.smtpPass}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPass: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <input
            placeholder="Daily limit (e.g. 500)"
            value={newAccountForm.dailyLimit}
            onChange={(event) => setNewAccountForm((current) => ({ ...current, dailyLimit: event.target.value }))}
            className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
          />
          <label className="flex items-center gap-2 text-[13px] text-[#5f6f89]">
            <input
              type="checkbox"
              checked={newAccountForm.smtpSecure}
              onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
            />
            Use implicit TLS (port 465)
          </label>
        </div>
        <div className="mt-3">
          <ActionButton label="Add mailbox" icon={PlusIcon} primary onClick={handleAddEmailAccount} />
        </div>
      </div>

      <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Status</p>
        <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
      </div>
    </section>
  );
}
