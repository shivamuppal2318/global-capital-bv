import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { RadarIcon, XIcon, ZapIcon } from "../Icons";
import { ScoringCriteriaPanel } from "./ScoringCriteriaPanel";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";

const PROVIDERS = [
  {
    id: "exa",
    label: "Exa Search",
    description: "Full-text article search — the richest source for the AI processor and chat assistant to work from.",
    docsUrl: "https://dashboard.exa.ai",
    placeholder: "…your Exa key…"
  },
  {
    id: "newsapi",
    label: "NewsAPI.ai (Event Registry)",
    description: "Keyword news search with full article body text, complementary to Exa.",
    docsUrl: "https://newsapi.ai",
    placeholder: "…your NewsAPI.ai key…"
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    description: "Scrapes specific known press/news URLs into full text, rather than searching broadly.",
    docsUrl: "https://firecrawl.dev",
    placeholder: "…your Firecrawl key…"
  },
  {
    id: "apollo",
    label: "Apollo",
    description: "Enriches a signal's company name into a real profile + contact, used to create a new lead automatically.",
    docsUrl: "https://apollo.io",
    placeholder: "…your Apollo key…"
  }
];

function ProviderCard({ provider, status, onSaved }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [testResult, setTestResult] = useState(null);

  async function handleSave(e) {
    e?.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      const saved = await adminApi.saveMarketIntelProviderKey(provider.id, apiKey.trim());
      onSaved(provider.id, saved);
      setApiKey("");
      setMessage({ ok: true, text: "Saved. Takes effect on the next pipeline run — no restart needed." });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      const saved = await adminApi.removeMarketIntelProviderKey(provider.id);
      onSaved(provider.id, saved);
      setApiKey("");
      setMessage({ ok: true, text: "Key removed. This source is skipped until a new key is saved." });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await adminApi.testMarketIntelProvider(provider.id));
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={RadarIcon}
        iconClass="text-[#8853d0]"
        subtitle={provider.description}
        action={
          status?.hasKey ? (
            <Badge tone={status.source === "environment" ? "amber" : "green"}>
              {status.source === "environment" ? "Using env var" : "Configured"}
            </Badge>
          ) : (
            <Badge tone="slate">Not configured</Badge>
          )
        }
      >
        {provider.label}
      </SectionTitle>

      <form onSubmit={handleSave} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <input
            type="password"
            className={inputClass}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.hasKey ? `${status.keyPreview} (saved — leave blank to keep)` : provider.placeholder}
            autoComplete="off"
          />
        </div>
        <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving || !apiKey.trim()} />
        <ActionButton label={testing ? "Testing…" : "Test"} icon={ZapIcon} small onClick={handleTest} disabled={testing || !status?.hasKey} />
        {status?.hasKey && status.source === "admin-panel" ? (
          <ActionButton label="Remove" icon={XIcon} small onClick={handleRemove} disabled={saving} />
        ) : null}
      </form>

      <p className="mt-2 text-[12px] text-[#8592ab]">
        Get a key at{" "}
        <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#3046b2] underline">
          {provider.docsUrl.replace("https://", "")}
        </a>
        . Stored encrypted (AES-256-GCM) and never displayed back after saving.
      </p>

      {message ? <p className={`mt-2 text-[13px] font-medium ${message.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{message.text}</p> : null}
      {testResult ? (
        <p className={`mt-2 text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{testResult.message}</p>
      ) : null}
    </Card>
  );
}

export function MarketIntelSettingsPanel() {
  const [providers, setProviders] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = () =>
    adminApi
      .getMarketIntelSettings()
      .then((data) => setProviders(data.providers))
      .catch((err) => setLoadError(err.message));

  useEffect(() => {
    load();
  }, []);

  function handleSaved(providerId, status) {
    setProviders((current) => ({ ...current, [providerId]: status }));
  }

  if (loadError) {
    return <Card className="px-5 py-6 text-[14px] text-[#e0483f]">{loadError}</Card>;
  }
  if (!providers) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading Market Intelligence settings…</Card>;
  }

  return (
    <div className="space-y-4">
      <p className="rounded-[12px] bg-[#eef1ff] px-4 py-3 text-[13px] leading-6 text-[#334463]">
        These keys power the Market Intelligence pipeline's data sources (Google News RSS needs no key and always runs).
        Every key here is optional — a source is simply skipped until its key is set, and nothing else breaks.
      </p>
      {PROVIDERS.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} status={providers[provider.id]} onSaved={handleSaved} />
      ))}

      <ScoringCriteriaPanel />
    </div>
  );
}
