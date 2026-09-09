import { useEffect, useState } from "react";
import { emailAccountsApi } from "../../lib/emailAccountsApi";
import { adminApi } from "../../lib/adminApi";
import { useAuth } from "../../context/AuthContext";
import { ActionButton, Badge, Card, SectionTitle } from "../ui";
import { MailIcon, PlusIcon, RefreshIcon, XIcon, ZapIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const EMPTY_FORM = {
  label: "",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: true,
  smtpUser: "",
  smtpPass: "",
  fromAddress: "",
  dailyLimit: 500,
  ownerId: ""
};

// Shared by the Admin Panel's "Email Accounts" tab (scope="all" — every
// mailbox in the company, with an owner picker) and "My Email Account"
// (scope="mine" — just the current user's own, ownership forced to self).
// Both drive the same GET /api/email-accounts, which the backend already
// filters by role — "mine" just also filters client-side so an Admin's own
// personal tab doesn't show every employee's mailbox too.
export function MailboxManager({ scope }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [testState, setTestState] = useState({});
  const [rowError, setRowError] = useState({});

  const load = () => {
    setLoading(true);
    emailAccountsApi
      .list()
      .then(setAccounts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (scope === "all" && user?.role === "ADMIN") {
      adminApi.listEmployees().then(setEmployees).catch(() => {});
    }
  }, [scope, user]);

  const visibleAccounts = scope === "mine" ? accounts.filter((a) => a.ownerId === user?.id) : accounts;

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await emailAccountsApi.create({
        ...form,
        smtpPort: Number(form.smtpPort),
        dailyLimit: Number(form.dailyLimit),
        ownerId: scope === "mine" ? user.id : form.ownerId || null
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id) => {
    setTestState((prev) => ({ ...prev, [id]: { testing: true } }));
    try {
      const result = await emailAccountsApi.test(id);
      setTestState((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestState((prev) => ({ ...prev, [id]: { success: false, message: err.message } }));
    }
  };

  const handleDeactivate = async (id) => {
    await emailAccountsApi.deactivate(id);
    load();
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Delete the mailbox "${label}"? This can't be undone.`)) {
      return;
    }
    setRowError((prev) => ({ ...prev, [id]: null }));
    try {
      await emailAccountsApi.remove(id);
      load();
    } catch (err) {
      // Per-row, not the list-level `error` — that one replaces the whole
      // mailbox list, which would hide every other account just because
      // deleting this one hit the backend's still-in-use guard (409 when a
      // campaign is still assigned to it).
      setRowError((prev) => ({ ...prev, [id]: err.message }));
    }
  };

  const ownerLabel = (account) => {
    if (!account.ownerId) return <Badge tone="slate">Shared</Badge>;
    if (account.ownerId === user?.id) return <Badge tone="green">You</Badge>;
    const owner = employees.find((e) => e.id === account.ownerId);
    return <Badge tone="blue">{owner?.name ?? "Employee"}</Badge>;
  };

  return (
    <Card className="px-5 py-5">
      <SectionTitle
        icon={MailIcon}
        iconClass="text-[#3046b2]"
        subtitle={
          scope === "mine"
            ? "Your personal SMTP mailbox(es) — used to send campaigns or replies from your own address."
            : "Every SMTP mailbox in the company — shared (company-wide) and personal (assigned to one employee)."
        }
        action={<ActionButton label={showForm ? "Cancel" : "Add mailbox"} icon={showForm ? XIcon : PlusIcon} small onClick={() => setShowForm((v) => !v)} />}
      >
        {scope === "mine" ? "My Email Account" : "Email Accounts"}
      </SectionTitle>

      {showForm ? (
        <form onSubmit={handleCreate} className="mt-5 rounded-[16px] border border-[#e7edf5] p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Label</label>
              <input required className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Sales Outbox" />
            </div>
            <div>
              <label className={labelClass}>From address</label>
              <input required type="email" className={inputClass} value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} placeholder="sales@company.com" />
            </div>
            <div>
              <label className={labelClass}>SMTP host</label>
              <input required className={inputClass} value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label className={labelClass}>SMTP port</label>
              <input required type="number" className={inputClass} value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>SMTP username</label>
              <input required className={inputClass} value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>SMTP password</label>
              <input required type="password" className={inputClass} value={form.smtpPass} onChange={(e) => setForm({ ...form, smtpPass: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Daily send limit</label>
              <input type="number" className={inputClass} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-7">
              <input
                type="checkbox"
                id="smtpSecure"
                checked={form.smtpSecure}
                onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
                className="size-4 accent-[#3046b2]"
              />
              <label htmlFor="smtpSecure" className="text-[14px] text-[#334463]">Use TLS/SSL</label>
            </div>
            {scope === "all" ? (
              <div className="md:col-span-2">
                <label className={labelClass}>Assign to</label>
                <select className={inputClass} value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                  <option value="">Shared (no owner — usable in any campaign)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {formError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}

          <div className="mt-4">
            <ActionButton label={saving ? "Saving…" : "Save mailbox"} primary small onClick={handleCreate} disabled={saving} />
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-2">
        {loading ? (
          <p className="text-[14px] text-[#8592ab]">Loading…</p>
        ) : error ? (
          <p className="text-[14px] text-[#e0483f]">{error}</p>
        ) : visibleAccounts.length === 0 ? (
          <p className="text-[14px] text-[#8592ab]">No mailboxes yet.</p>
        ) : (
          visibleAccounts.map((account) => {
            const test = testState[account.id];
            return (
              <div key={account.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-[#102246]">{account.label}</p>
                      {ownerLabel(account)}
                      {!account.isActive ? <Badge tone="slate">Inactive</Badge> : null}
                    </div>
                    <p className="text-[12px] text-[#8592ab]">
                      {account.fromAddress} · {account.smtpHost}:{account.smtpPort} · {account.dailyLimit}/day
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionButton
                      label={test?.testing ? "Testing…" : "Test"}
                      icon={ZapIcon}
                      small
                      onClick={() => handleTest(account.id)}
                      disabled={test?.testing}
                    />
                    {account.isActive ? (
                      <ActionButton label="Deactivate" icon={RefreshIcon} small onClick={() => handleDeactivate(account.id)} />
                    ) : null}
                    <ActionButton label="Delete" icon={XIcon} small onClick={() => handleDelete(account.id, account.label)} />
                  </div>
                </div>
                {test && !test.testing ? (
                  <p className={`mt-2 text-[13px] font-medium ${test.success ? "text-[#2b9b60]" : "text-[#e0483f]"}`}>{test.message}</p>
                ) : null}
                {rowError[account.id] ? (
                  <p className="mt-2 text-[13px] font-medium text-[#e0483f]">{rowError[account.id]}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
