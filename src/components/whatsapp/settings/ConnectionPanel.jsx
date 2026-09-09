import { useEffect, useState } from "react";
import { CheckCircleIcon, CopyIcon, LinkIcon, PhoneIcon, RefreshIcon, SparklesIcon, ZapIcon } from "../../Icons";
import { ActionButton, Badge, Card, SectionTitle } from "../../ui";
import { api } from "../../../lib/api";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const LEAD_STATUS_OPTIONS = ["Default", "New", "Contacted", "Qualified"];
const LEAD_SOURCE_OPTIONS = ["Default", "WhatsApp Inbound", "Referral", "Website"];
const ASSIGNED_TO_OPTIONS = ["Default", "Round robin", "Rahul R", "Meera S", "Vijay K", "Anika T"];

export function ConnectionPanel() {
  const [connection, setConnection] = useState(null);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState(null);
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [appSecretInput, setAppSecretInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [refreshingNumbers, setRefreshingNumbers] = useState(false);
  const [refreshNote, setRefreshNote] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/settings/connection"), api.get("/settings/phone-numbers")])
      .then(([connectionData, numbers]) => {
        setConnection(connectionData);
        setForm(connectionData);
        setPhoneNumbers(numbers);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await api.patch("/settings/connection", {
        ...form,
        campaignBatchSize: Number(form.campaignBatchSize) || 50,
        accessToken: accessTokenInput || undefined,
        appSecret: appSecretInput || undefined
      });
      setConnection(updated);
      setForm(updated);
      setAccessTokenInput("");
      setAppSecretInput("");
      setSaveMessage({ ok: true, text: "Settings saved." });
    } catch (err) {
      setSaveMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post("/settings/connection/test");
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshNumbers = async () => {
    setRefreshingNumbers(true);
    setRefreshNote(null);
    try {
      const result = await api.post("/settings/phone-numbers/refresh");
      setPhoneNumbers(result.numbers);
      setRefreshNote(
        result.refreshedFromMeta ? "Refreshed from Meta." : "Showing saved numbers — add a WABA ID and access token to pull live numbers from Meta."
      );
    } catch (err) {
      setRefreshNote(err.message);
    } finally {
      setRefreshingNumbers(false);
    }
  };

  const handleSelectNumber = async (id) => {
    const updated = await api.patch(`/settings/phone-numbers/${id}/select`);
    setPhoneNumbers((prev) => prev.map((n) => (n.id === updated.id ? updated : { ...n, isSending: false })));
  };

  const handleRegenerateToken = async () => {
    const result = await api.post("/settings/connection/webhook/regenerate-token");
    updateForm({ webhookVerifyToken: result.webhookVerifyToken });
    setConnection((prev) => ({ ...prev, webhookVerifyToken: result.webhookVerifyToken }));
  };

  const handleCopy = async (label, value) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading connection settings…</Card>
    );
  }

  if (loadError) {
    return (
      <Card className="px-5 py-6 text-[14px] text-[#e0483f]">
        Could not reach the backend at http://localhost:4000 — is the API server running? ({loadError})
      </Card>
    );
  }

  const canEmbeddedSignup = Boolean(form.appId && form.embeddedSignupConfigId);

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle icon={SparklesIcon} iconClass="text-[#2b9b60]">
          Connect WhatsApp Business (Embedded Signup / Coexistence)
        </SectionTitle>
        <p className="mt-2 text-[14px] leading-6 text-[#5f6f89]">
          Log in with Facebook to connect your WhatsApp Business Account. Coexistence lets you keep using the WhatsApp
          Business app on your phone while the Cloud API runs on the same number — set up a Coexistence-enabled Embedded
          Signup configuration in your Meta app and paste its Configuration ID below.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
          <div>
            <button
              type="button"
              disabled={!canEmbeddedSignup}
              className={`inline-flex items-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-semibold text-white transition ${
                canEmbeddedSignup ? "bg-[#1877f2] hover:bg-[#1567d6]" : "cursor-not-allowed bg-[#a9c3ef]"
              }`}
            >
              <span className="grid size-5 place-items-center rounded-full bg-white text-[12px] font-bold text-[#1877f2]">f</span>
              Connect with Facebook
            </button>
            {!canEmbeddedSignup ? (
              <p className="mt-2 max-w-xs text-[12px] leading-5 text-[#c47f1a]">
                Enter your App ID (below) and Embedded Signup configuration ID, then save, to enable this.
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass}>Embedded Signup configuration ID</label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. 1234567890123456"
              value={form.embeddedSignupConfigId}
              onChange={(e) => updateForm({ embeddedSignupConfigId: e.target.value })}
            />
          </div>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={PhoneIcon}
          iconClass="text-[#3046b2]"
          subtitle="All numbers under your WhatsApp Business Account. Pick which one is used to send messages."
          action={
            <ActionButton
              label={refreshingNumbers ? "Refreshing…" : "Refresh"}
              icon={RefreshIcon}
              small
              onClick={handleRefreshNumbers}
            />
          }
        >
          Phone numbers on this account
        </SectionTitle>
        {refreshNote ? <p className="mt-3 text-[13px] text-[#8592ab]">{refreshNote}</p> : null}
        <div className="mt-4 space-y-2">
          {phoneNumbers.length === 0 ? (
            <p className="text-[14px] text-[#8592ab]">No phone numbers yet — click Refresh once credentials are saved.</p>
          ) : (
            phoneNumbers.map((number) => (
              <label
                key={number.id}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-[14px] border px-4 py-3 transition ${
                  number.isSending ? "border-[#3046b2] bg-[#f4f7fd]" : "border-[#e7edf5] hover:bg-[#f8faff]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="sending-number"
                    checked={number.isSending}
                    onChange={() => handleSelectNumber(number.id)}
                    className="size-4 accent-[#3046b2]"
                  />
                  <div>
                    <p className="text-[14px] font-medium text-[#102246]">{number.phoneNumber}</p>
                    <p className="text-[12px] text-[#8592ab]">{number.displayName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={number.qualityRating === "High" ? "green" : "slate"}>{number.qualityRating}</Badge>
                  <Badge tone="blue">{number.status}</Badge>
                </div>
              </label>
            ))
          )}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={LinkIcon}
          iconClass="text-[#3046b2]"
          subtitle="Connect with the button above (recommended) or paste your Cloud API credentials manually."
        >
          WhatsApp Cloud API credentials
        </SectionTitle>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Phone Number ID</label>
            <input
              type="text"
              className={inputClass}
              value={form.phoneNumberId}
              onChange={(e) => updateForm({ phoneNumberId: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>WhatsApp Business Account ID</label>
            <input type="text" className={inputClass} value={form.wabaId} onChange={(e) => updateForm({ wabaId: e.target.value })} />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Permanent Access Token</label>
          <textarea
            rows={3}
            className={`${inputClass} resize-y`}
            placeholder={connection.hasAccessToken ? connection.accessTokenPreview : "Paste your permanent access token"}
            value={accessTokenInput}
            onChange={(e) => setAccessTokenInput(e.target.value)}
          />
          {connection.hasAccessToken ? (
            <p className="mt-1 text-[12px] text-[#8592ab]">Currently saved: {connection.accessTokenPreview}. Leave blank to keep it.</p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>App ID (optional)</label>
            <input type="text" className={inputClass} value={form.appId} onChange={(e) => updateForm({ appId: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>App Secret (optional)</label>
            <input
              type="password"
              className={inputClass}
              placeholder={connection.hasAppSecret ? connection.appSecretPreview : ""}
              value={appSecretInput}
              onChange={(e) => setAppSecretInput(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <label className={labelClass}>Campaign batch size per cron run</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.campaignBatchSize}
            onChange={(e) => updateForm({ campaignBatchSize: e.target.value })}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <ActionButton label={testing ? "Testing…" : "Test connection"} icon={ZapIcon} small onClick={handleTestConnection} />
          {testResult ? (
            <p className={`text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>
              {testResult.message}
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={CheckCircleIcon} iconClass="text-[#2b9b60]">
          Lead
        </SectionTitle>
        <label className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.autoCreateLead}
            onChange={(e) => updateForm({ autoCreateLead: e.target.checked })}
            className="size-4 accent-[#3046b2]"
          />
          <span className="text-[14px] font-semibold text-[#102246]">Automatically create a CRM lead for unknown inbound numbers</span>
        </label>
        <p className="mt-1 pl-7 text-[13px] text-[#8592ab]">Defaults applied when an inbound WhatsApp number is auto-converted into a CRM lead.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Lead status</label>
            <select
              className={inputClass}
              value={form.leadDefaultStatus}
              onChange={(e) => updateForm({ leadDefaultStatus: e.target.value })}
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Lead source</label>
            <select
              className={inputClass}
              value={form.leadDefaultSource}
              onChange={(e) => updateForm({ leadDefaultSource: e.target.value })}
            >
              {LEAD_SOURCE_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Assigned to</label>
            <select
              className={inputClass}
              value={form.leadDefaultAssignedTo}
              onChange={(e) => updateForm({ leadDefaultAssignedTo: e.target.value })}
            >
              {ASSIGNED_TO_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={LinkIcon} iconClass="text-[#3046b2]" subtitle="Paste these two values into the Meta App Dashboard > WhatsApp > Configuration > Webhook.">
          Webhook configuration
        </SectionTitle>
        <div className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Callback URL</label>
            <div className="flex items-center gap-2">
              <input type="text" readOnly className={`${inputClass} bg-[#f7f9fc]`} value={connection.webhookUrl} />
              <button
                type="button"
                onClick={() => handleCopy("url", connection.webhookUrl)}
                className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
              >
                <CopyIcon className="size-4" />
              </button>
            </div>
            {copied === "url" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
          </div>
          <div>
            <label className={labelClass}>Verify token</label>
            <div className="flex items-center gap-2">
              <input type="text" readOnly className={`${inputClass} bg-[#f7f9fc]`} value={form.webhookVerifyToken} />
              <button
                type="button"
                onClick={() => handleCopy("token", form.webhookVerifyToken)}
                className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
              >
                <CopyIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={handleRegenerateToken}
                className="grid size-10 shrink-0 place-items-center rounded-[12px] border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
                title="Regenerate"
              >
                <RefreshIcon className="size-4" />
              </button>
            </div>
            {copied === "token" ? <p className="mt-1 text-[12px] text-[#2b9b60]">Copied.</p> : null}
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <ActionButton label={saving ? "Saving…" : "Save"} primary onClick={handleSave} />
        {saveMessage ? (
          <p className={`text-[13px] font-medium ${saveMessage.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{saveMessage.text}</p>
        ) : null}
      </div>
    </div>
  );
}
