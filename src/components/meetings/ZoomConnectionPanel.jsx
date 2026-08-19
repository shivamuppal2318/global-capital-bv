import { useEffect, useState } from "react";
import { CheckCircleIcon, VideoIcon, ZapIcon } from "../Icons";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { zoomApi } from "../../lib/zoomApi";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

export function ZoomConnectionPanel() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    zoomApi
      .getSettings()
      .then((data) => {
        setSettings(data);
        setForm(data);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await zoomApi.updateSettings({
        accountId: form.accountId,
        clientId: form.clientId,
        hostEmail: form.hostEmail,
        clientSecret: clientSecretInput || undefined
      });
      setSettings(updated);
      setForm(updated);
      setClientSecretInput("");
      setSaveMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await zoomApi.testConnection();
      setTestResult(result);
      if (result.success) {
        setSettings((prev) => ({ ...prev, connected: true }));
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading Zoom settings…</Card>;
  }

  if (loadError) {
    return (
      <Card className="px-5 py-6 text-[14px] text-[#e0483f]">
        Could not reach the backend at http://localhost:4000 — is the API server running? ({loadError})
      </Card>
    );
  }

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={VideoIcon}
        iconClass="text-[#2d8cff]"
        subtitle="Server-to-Server OAuth app from the Zoom App Marketplace — no per-user login flow needed."
        action={<Badge tone={settings.connected ? "green" : "slate"}>{settings.connected ? "Connected" : "Not connected"}</Badge>}
      >
        Zoom connection
      </SectionTitle>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>Account ID</label>
          <input type="text" className={inputClass} value={form.accountId} onChange={(e) => updateForm({ accountId: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Client ID</label>
          <input type="text" className={inputClass} value={form.clientId} onChange={(e) => updateForm({ clientId: e.target.value })} />
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Client Secret</label>
        <input
          type="password"
          className={inputClass}
          placeholder={settings.hasClientSecret ? settings.clientSecretPreview : "Paste your client secret"}
          value={clientSecretInput}
          onChange={(e) => setClientSecretInput(e.target.value)}
        />
        {settings.hasClientSecret ? (
          <p className="mt-1 text-[12px] text-[#8592ab]">Currently saved: {settings.clientSecretPreview}. Leave blank to keep it.</p>
        ) : null}
      </div>

      <div className="mt-4">
        <label className={labelClass}>Host email</label>
        <input
          type="email"
          className={inputClass}
          placeholder="you@company.com"
          value={form.hostEmail}
          onChange={(e) => updateForm({ hostEmail: e.target.value })}
        />
        <p className="mt-1 text-[12px] text-[#8592ab]">A licensed user on this Zoom account — meetings are scheduled under this host.</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} />
        <ActionButton label={testing ? "Testing…" : "Test connection"} icon={ZapIcon} small onClick={handleTest} />
        {saveMessage ? (
          <p className={`text-[13px] font-medium ${saveMessage.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{saveMessage.text}</p>
        ) : null}
      </div>
      {testResult ? (
        <p className={`mt-2 flex items-center gap-2 text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>
          {testResult.success ? <CheckCircleIcon className="size-4" /> : null}
          {testResult.message}
        </p>
      ) : null}
    </Card>
  );
}
