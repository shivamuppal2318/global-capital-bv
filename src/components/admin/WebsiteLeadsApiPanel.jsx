import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ActionButton, Card, SectionTitle } from "../ui";
import { GlobeIcon, CopyIcon, RefreshIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-[#f7f9fc] px-3.5 py-2.5 font-mono text-[13px] text-[#102246] outline-none";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

// Shared by Admin Panel's own "Website Leads" tab and Email Automation's
// Leads tab ("Website Lead" button) -- same key, same endpoint, so both
// places can never show a stale or conflicting copy of it. Backed by the
// same BusinessSettings.leadWebhookApiKey and GET/POST /settings/integrations
// routes Email Automation's SettingsTab.jsx already used for the general
// lead-ingestion API -- this just points at the email-domain inbound route
// and drops the campaign field, since a lead posted with none now lands in
// the auto-created "Website Leads" list (see routes/emailLeads.js).
export function WebsiteLeadsApiPanel() {
  const [integration, setIntegration] = useState(null);
  const [error, setError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api
      .get("/settings/integrations")
      .then(setIntegration)
      .catch((err) => setError(err.message));
  }, []);

  const webhookUrl = integration?.webhookUrl?.replace("/api/leads/inbound", "/api/email/leads/inbound");

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
    ? `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${integration.apiKey}" \\
  -d '{
    "full_name": "Marco Reyes",
    "email": "marco@example.com",
    "company": "Sunridge Capital"
  }'`
    : "";

  const htmlExample = integration
    ? `<form id="website-lead-form">
  <input name="full_name" placeholder="Name" required />
  <input name="email" type="email" placeholder="Email" required />
  <input name="company" placeholder="Company" />
  <button type="submit">Submit</button>
</form>

<script>
document.getElementById("website-lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  await fetch("${webhookUrl}", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "${integration.apiKey}" },
    body: JSON.stringify({ full_name: f.full_name.value, email: f.email.value, company: f.company.value })
  });
  f.reset();
  alert("Thanks! We'll be in touch.");
});
</script>`
    : "";

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={GlobeIcon}
        iconClass="text-[#3046b2]"
        subtitle="Every lead posted here lands in a shared &ldquo;Website Leads&rdquo; list automatically — no campaign to pick, no cold-outreach cadence sent to them."
      >
        Website Lead Capture API
      </SectionTitle>

      {error ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}
      {!error && !integration ? <p className="mt-4 text-[13px] text-[#8592ab]">Loading…</p> : null}

      {integration ? (
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Webhook / API endpoint</label>
            <div className="flex items-center gap-2">
              <input readOnly value={webhookUrl} className={inputClass} />
              <button type="button" onClick={() => handleCopy("url", webhookUrl)} className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89]">
                <CopyIcon className="size-4" />
              </button>
            </div>
            {copied === "url" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
          </div>

          <div>
            <label className={labelClass}>API key</label>
            <div className="flex items-center gap-2">
              <input readOnly value={integration.apiKey} className={inputClass} />
              <button type="button" onClick={() => handleCopy("key", integration.apiKey)} className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89]">
                <CopyIcon className="size-4" />
              </button>
              <ActionButton label={regenerating ? "Regenerating…" : "Regenerate"} icon={RefreshIcon} small onClick={handleRegenerateKey} />
            </div>
            {copied === "key" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
            <p className="mt-1 text-[12px] text-[#8592ab]">
              This same key also works against the general lead-ingestion API (Email Automation → Settings), so
              regenerating it replaces both at once.
            </p>
          </div>

          <div>
            <label className={labelClass}>Server-side example (recommended)</label>
            <pre className="overflow-x-auto rounded-[14px] bg-[#0f2042] px-4 py-3 text-[12px] leading-6 text-[#dfe6f7]">
              <code>{curlExample}</code>
            </pre>
            <p className="mt-1 text-[12px] text-[#8592ab]">
              Call this from your website's own backend, a form-builder's webhook, or Zapier — the API key never
              reaches the visitor's browser this way.
            </p>
          </div>

          <div>
            <label className={labelClass}>Directly from a website form</label>
            <pre className="overflow-x-auto rounded-[14px] bg-[#0f2042] px-4 py-3 text-[12px] leading-6 text-[#dfe6f7]">
              <code>{htmlExample}</code>
            </pre>
            <p className="mt-1 text-[12px] font-medium text-[#c9752f]">
              Anyone who views this page's source can read the API key embedded in it — fine for a low-stakes
              contact form, but prefer the server-side example above if you'd rather the key never appear
              client-side.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
