import { useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi";
import { useAuth } from "../../context/AuthContext";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { MailIcon, ZapIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const EMPTY = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  fromAddress: "",
  fromName: "Global Capital BV"
};

// The mailbox the app sends its own transactional mail from — password
// resets and new-account handoffs. Separate from the campaign mailboxes
// under Email Accounts on purpose: a password reset must not break because
// someone paused their outreach mailbox.
export function SystemEmailPanel() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [hasPassword, setHasPassword] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    adminApi
      .getSystemEmail()
      .then((data) => {
        if (data) {
          setForm({ ...EMPTY, ...data, smtpPass: "" });
          setHasPassword(Boolean(data.hasPassword));
          setConfigured(true);
        }
      })
      .catch((err) => setMessage({ ok: false, text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.email && !testTo) setTestTo(user.email);
  }, [user, testTo]);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await adminApi.saveSystemEmail({
        ...form,
        smtpPort: Number(form.smtpPort) || 587,
        // Blank means "keep the stored password" — the API treats an
        // omitted password that way, so don't send an empty string.
        smtpPass: form.smtpPass || undefined
      });
      setForm({ ...EMPTY, ...saved, smtpPass: "" });
      setHasPassword(Boolean(saved.hasPassword));
      setConfigured(true);
      setMessage({ ok: true, text: "System email settings saved." });
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
      setTestResult(await adminApi.testSystemEmail(testTo.trim() || undefined));
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading system email settings…</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="px-5 py-5">
        <SectionTitle
          icon={MailIcon}
          iconClass="text-[#3046b2]"
          subtitle="Used for password-reset links and for emailing new employees their sign-in details. This is the app's own mailbox — not a sales campaign mailbox."
          action={configured ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not set up</Badge>}
        >
          System Email (SMTP)
        </SectionTitle>

        {!configured ? (
          <p className="mt-4 rounded-[12px] bg-[#fff4e7] px-4 py-3 text-[13px] leading-6 text-[#c47f1a]">
            Until this is set up, <strong>Forgot password won't send anything</strong> and new employees won't be emailed their
            password — you'd have to pass it on yourself. Any SMTP mailbox works (Google Workspace, Zoho, your host's mail server).
          </p>
        ) : null}

        <form onSubmit={handleSave} className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>SMTP host</label>
            <input required className={inputClass} value={form.smtpHost} onChange={(e) => update({ smtpHost: e.target.value })} placeholder="smtp.zoho.com" />
          </div>
          <div>
            <label className={labelClass}>SMTP port</label>
            <input required type="number" className={inputClass} value={form.smtpPort} onChange={(e) => update({ smtpPort: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>SMTP username</label>
            <input required className={inputClass} value={form.smtpUser} onChange={(e) => update({ smtpUser: e.target.value })} placeholder="noreply@yourcompany.com" />
          </div>
          <div>
            <label className={labelClass}>SMTP password</label>
            <input
              type="password"
              className={inputClass}
              value={form.smtpPass}
              onChange={(e) => update({ smtpPass: e.target.value })}
              placeholder={hasPassword ? "•••••••• (saved — leave blank to keep)" : "App password"}
            />
            {hasPassword ? <p className="mt-1 text-[12px] text-[#8592ab]">Leave blank to keep the saved password.</p> : null}
          </div>
          <div>
            <label className={labelClass}>From address</label>
            <input required type="email" className={inputClass} value={form.fromAddress} onChange={(e) => update({ fromAddress: e.target.value })} placeholder="noreply@yourcompany.com" />
          </div>
          <div>
            <label className={labelClass}>From name</label>
            <input className={inputClass} value={form.fromName} onChange={(e) => update({ fromName: e.target.value })} />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              id="systemSmtpSecure"
              checked={form.smtpSecure}
              onChange={(e) => update({ smtpSecure: e.target.checked })}
              className="size-4 accent-[#3046b2]"
            />
            <label htmlFor="systemSmtpSecure" className="text-[14px] text-[#334463]">
              Use TLS/SSL directly (port 465). Leave off for STARTTLS on port 587.
            </label>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ActionButton label={saving ? "Saving…" : "Save settings"} primary small onClick={handleSave} disabled={saving} />
          {message ? (
            <p className={`text-[13px] font-medium ${message.ok ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{message.text}</p>
          ) : null}
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={ZapIcon} iconClass="text-[#f29b3a]" subtitle="Checks the credentials, then sends a real message so you can confirm delivery — not just that the login worked.">
          Send a test email
        </SectionTitle>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className={labelClass}>Send test to</label>
            <input type="email" className={inputClass} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" />
          </div>
          <ActionButton label={testing ? "Testing…" : "Test connection"} icon={ZapIcon} small onClick={handleTest} disabled={testing || !configured} />
        </div>
        {testResult ? (
          <p className={`mt-3 text-[13px] font-medium ${testResult.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{testResult.message}</p>
        ) : null}
      </Card>
    </div>
  );
}
