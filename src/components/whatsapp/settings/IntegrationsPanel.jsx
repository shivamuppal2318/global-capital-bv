import { useEffect, useState } from "react";
import { CogIcon, CopyIcon, LinkIcon, RefreshIcon } from "../../Icons";
import { ActionButton, Card, SectionTitle } from "../../ui";
import { api } from "../../../lib/api";

const FIELD_MAP = [
  ["Lead name (required)", "name, full_name, lead_name, contact_name"],
  ["Email", "email, email_address"],
  ["Mobile / phone", "mobile, phone, phone_number, whatsapp"],
  ["Company", "company, company_name, organization"],
  ["Deal size", "capital_ask, deal_size, amount, value, budget"],
  ["Source platform", "source, lead_source, utm_source, channel"],
  ["Territory", "territory, region, location, country"],
  ["Notes / message", "notes, message, comments, description"]
];

export function IntegrationsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api
      .get("/settings/integrations")
      .then(setData)
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async (label, value) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const result = await api.post("/settings/integrations/regenerate-key");
      setData((prev) => ({ ...prev, apiKey: result.apiKey }));
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading integration settings…</Card>;
  }

  if (loadError) {
    return <Card className="px-5 py-6 text-[14px] text-[#e0483f]">{loadError}</Card>;
  }

  const curlExample = `curl -X POST ${data.webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${data.apiKey}" \\
  -d '{
    "full_name": "Marco Reyes",
    "email": "marco@example.com",
    "company": "Sunridge Capital",
    "deal_size": "€3M Seed",
    "source": "Website Form"
  }'`;

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={LinkIcon}
          iconClass="text-[#3046b2]"
          subtitle="Any platform — a website form, an ad platform, Zapier, another CRM, a custom script — can POST a new lead directly into this CRM."
        >
          Lead ingestion API
        </SectionTitle>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Webhook / API endpoint</label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={data.webhookUrl}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f7f9fc] px-3.5 py-2.5 font-mono text-[13px] text-[#102246] outline-none"
              />
              <button
                type="button"
                onClick={() => handleCopy("url", data.webhookUrl)}
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
                value={data.apiKey}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f7f9fc] px-3.5 py-2.5 font-mono text-[13px] text-[#102246] outline-none"
              />
              <button
                type="button"
                onClick={() => handleCopy("key", data.apiKey)}
                className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
              >
                <CopyIcon className="size-4" />
              </button>
              <ActionButton
                label={regenerating ? "Regenerating…" : "Regenerate"}
                icon={RefreshIcon}
                small
                onClick={handleRegenerate}
              />
            </div>
            {copied === "key" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
            <p className="mt-1 text-[12px] text-[#c47f1a]">Regenerating instantly breaks any platform already sending leads with the old key.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#334463]">Example request</label>
            <pre className="overflow-x-auto rounded-[14px] bg-[#0f2042] px-4 py-3 text-[12px] leading-6 text-[#dfe6f7]">
              <code>{curlExample}</code>
            </pre>
          </div>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={CogIcon} iconClass="text-[#5f6f89]" subtitle="Field names are matched loosely — send whatever your platform calls them.">
          Accepted field names
        </SectionTitle>
        <div className="mt-4 space-y-2">
          {FIELD_MAP.map(([label, aliases]) => (
            <div key={label} className="flex flex-col gap-1 rounded-[12px] border border-[#e7edf5] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] font-semibold text-[#102246]">{label}</p>
              <p className="font-mono text-[12px] text-[#5f6f89]">{aliases}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-6 text-[#5f6f89]">
          New leads land with status <span className="font-semibold text-[#102246]">New</span> and are visible immediately in{" "}
          <span className="font-semibold text-[#102246]">CRM Workspace</span>. The full original payload is kept for reference even
          when fields don't map cleanly.
        </p>
      </Card>
    </div>
  );
}
