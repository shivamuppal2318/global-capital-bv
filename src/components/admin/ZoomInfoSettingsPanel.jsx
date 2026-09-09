import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { GlobeIcon, ZapIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

// ZoomInfo's GTM API (OAuth2 client_credentials) — powers CRM Workspace's
// "Enrich" action, which fills in industry/territory plus a company-info
// card (revenue, employee count, website, etc.) from a lead's company name.
export function ZoomInfoSettingsPanel() {
  const [status, setStatus] = useState({ clientId: "", hasClientSecret: false, connected: false, lastTestedAt: null });
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = () =>
    adminApi
      .getZoomInfoSettings()
      .then((data) => {
        setStatus(data);
        setClientId(data.clientId ?? "");
      })
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setTestResult(null);
    try {
      const saved = await adminApi.saveZoomInfoSettings({ clientId: clientId.trim(), clientSecret: clientSecret.trim() || undefined });
      setStatus(saved);
      setClientSecret("");
      setMessage({ ok: true, text: "Saved. Test the connection below to confirm it works." });
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
      const result = await adminApi.testZoomInfoSettings();
      setTestResult(result);
      if (result.success) setStatus((prev) => ({ ...prev, connected: true }));
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading ZoomInfo settings…</Card>;
  }

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={GlobeIcon}
        iconClass="text-[#e0483f]"
        subtitle="OAuth2 client_credentials app from ZoomInfo's GTM platform — powers the 'Enrich' action in CRM Workspace."
        action={<Badge tone={status.connected ? "green" : "slate"}>{status.connected ? "Connected" : "Not connected"}</Badge>}
      >
        ZoomInfo connection
      </SectionTitle>

      <div className="mt-5">
        <label className={labelClass}>Client ID</label>
        <input type="text" className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="0oa..." />
      </div>

      <div className="mt-4">
        <label className={labelClass}>Client Secret</label>
        <input
          type="password"
          className={inputClass}
          placeholder={status.hasClientSecret ? "•••• saved — leave blank to keep" : "Paste your client secret"}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
        />
        <p className="mt-1 text-[12px] text-[#8592ab]">
          {status.hasClientSecret
            ? "Leave blank to keep the saved secret. Stored encrypted and never shown again."
            : "Stored encrypted (AES-256-GCM) and never displayed back after saving."}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving} />
        <ActionButton label={testing ? "Testing…" : "Test connection"} icon={ZapIcon} small onClick={handleTest} disabled={testing} />
        {message ? <p className={`text-[13px] font-medium ${message.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{message.text}</p> : null}
      </div>
      {testResult ? (
        <p className={`mt-2 text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{testResult.message}</p>
      ) : null}
    </Card>
  );
}
