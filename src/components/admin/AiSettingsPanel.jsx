import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { SparklesIcon, ZapIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

// Claude models this app is expected to run against. Free text is still
// allowed below so a newer model can be used without a code change.
const MODEL_OPTIONS = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced (recommended)" },
  { id: "claude-opus-5", label: "Claude Opus 5 — most capable, slower" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fastest, cheapest" }
];

export function AiSettingsPanel() {
  const [model, setModel] = useState("claude-sonnet-5");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState({ hasKey: false, keyPreview: null, source: "unset" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = () =>
    adminApi
      .getAiSettings()
      .then((data) => {
        setModel(data.model);
        setStatus(data);
      })
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      // Blank means "keep the stored key" — don't send an empty string.
      const saved = await adminApi.saveAiSettings({ model, apiKey: apiKey.trim() || undefined });
      setStatus(saved);
      setApiKey("");
      setMessage({ ok: true, text: "Saved. The AI Assistant and Market Intelligence will use this immediately." });
    } catch (err) {
      setMessage({ ok: false, text: typeof err.message === "string" ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await adminApi.testAiSettings());
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading AI settings…</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={SparklesIcon}
          iconClass="text-[#8b52d0]"
          subtitle="One Claude API key powers both the AI Assistant (the chat bubble, with access to your live CRM data) and Market Intelligence signal processing."
          action={
            status.hasKey ? (
              <Badge tone={status.source === "environment" ? "amber" : "green"}>
                {status.source === "environment" ? "Using env var" : "Configured"}
              </Badge>
            ) : (
              <Badge tone="amber">Not set up</Badge>
            )
          }
        >
          Claude API (Anthropic)
        </SectionTitle>

        {!status.hasKey ? (
          <p className="mt-4 rounded-[12px] bg-[#f6eeff] px-4 py-3 text-[13px] leading-6 text-[#7a45bd]">
            Until a key is added, the AI Assistant replies with a setup notice and Market Intelligence captures signals but
            can't score or summarise them. Create a key at{" "}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="font-semibold underline">
              console.anthropic.com
            </a>{" "}
            → API Keys, then paste it below. Usage is billed to that Anthropic account.
          </p>
        ) : null}

        {status.source === "environment" ? (
          <p className="mt-4 rounded-[12px] bg-[#fff4e7] px-4 py-3 text-[13px] leading-6 text-[#c47f1a]">
            Currently reading the key from the <strong>ANTHROPIC_API_KEY</strong> environment variable. Saving a key here
            overrides it — worth doing, since env vars set in Coolify don't always reach the container.
          </p>
        ) : null}

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div>
            <label className={labelClass}>API key</label>
            <input
              type="password"
              className={inputClass}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status.hasKey ? `${status.keyPreview} (saved — leave blank to keep)` : "sk-ant-api03-…"}
              autoComplete="off"
            />
            <p className="mt-1 text-[12px] text-[#8592ab]">
              {status.hasKey
                ? "Leave blank to keep the saved key. It's stored encrypted and never shown again."
                : "Stored encrypted (AES-256-GCM) and never displayed back after saving."}
            </p>
          </div>

          <div className="max-w-md">
            <label className={labelClass}>Model</label>
            <select className={inputClass} value={MODEL_OPTIONS.some((m) => m.id === model) ? model : "custom"} onChange={(e) => e.target.value !== "custom" && setModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="custom">Other (type below)</option>
            </select>
            <input
              className={`${inputClass} mt-2`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-sonnet-5"
            />
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving} />
          {message ? (
            <p className={`text-[13px] font-medium ${message.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{message.text}</p>
          ) : null}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={ZapIcon} iconClass="text-[#f29b3a]" subtitle="Sends a tiny real request to Anthropic to confirm the key and model actually work — not just that the key looks well-formed.">
          Test connection
        </SectionTitle>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton
            label={testing ? "Testing…" : "Test Claude connection"}
            icon={ZapIcon}
            small
            onClick={handleTest}
            disabled={testing || !status.hasKey}
          />
          {testResult ? (
            <p className={`text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{testResult.message}</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
