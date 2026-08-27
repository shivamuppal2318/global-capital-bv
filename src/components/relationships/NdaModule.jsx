import { useCallback, useEffect, useMemo, useState } from "react";
import { ndaApi } from "../../lib/relationshipsApi";
import { leadsApi } from "../../lib/leadsApi";
import { documentsApi } from "../../lib/documentsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, PlusIcon, SearchIcon, XIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const STATUSES = ["DRAFT", "SENT", "REMINDER_1", "REMINDER_2", "SIGNED", "DECLINED", "EXPIRED"];

const STATUS_LABEL = {
  DRAFT: "Draft",
  SENT: "Sent",
  REMINDER_1: "Reminder 1",
  REMINDER_2: "Reminder 2",
  SIGNED: "Signed",
  DECLINED: "Declined",
  EXPIRED: "Expired"
};

const STATUS_TONE = {
  DRAFT: "slate",
  SENT: "blue",
  REMINDER_1: "amber",
  REMINDER_2: "amber",
  SIGNED: "green",
  DECLINED: "red",
  EXPIRED: "red"
};

// The status flow from the spec. Declined and expired are deliberately not
// on it - they are exits from the flow, not steps along it.
const FLOW = [
  { status: "SENT", label: "Sent NDA", action: "send", field: "sentAt" },
  { status: "REMINDER_1", label: "Reminder 1", action: "remind1", field: "reminder1At" },
  { status: "REMINDER_2", label: "Reminder 2", action: "remind2", field: "reminder2At" },
  { status: "SIGNED", label: "Signed", action: "sign", field: "signedAt" }
];

const asDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const has = (v) => v !== null && v !== undefined;

export function NdaModule() {
  const [records, setRecords] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([ndaApi.list({ status: statusFilter, q: query }), ndaApi.metrics()])
      .then(([rows, m]) => {
        setRecords(rows);
        setMetrics(m);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    leadsApi.list().then(setLeads).catch(() => {});
    documentsApi.list().then(setDocuments).catch(() => {});
  }, []);

  const startNew = () =>
    setEditing({
      leadId: "",
      status: "DRAFT",
      sentAt: "",
      signedAt: "",
      expiresAt: "",
      signerName: "",
      signerEmail: "",
      owner: "",
      notes: "",
      documentId: ""
    });

  const startEdit = (r) =>
    setEditing({
      id: r.id,
      leadId: r.lead?.id ?? "",
      status: r.status,
      sentAt: asDateInput(r.sentAt),
      signedAt: asDateInput(r.signedAt),
      expiresAt: asDateInput(r.expiresAt),
      signerName: r.signerName ?? "",
      signerEmail: r.signerEmail ?? "",
      owner: r.owner ?? "",
      notes: r.notes ?? "",
      documentId: r.document?.id ?? ""
    });

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!editing.leadId) return setFormError("Pick which lead this NDA is with.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing };
      // Empty date inputs must clear the field, not be sent as an empty string.
      for (const k of ["sentAt", "signedAt", "expiresAt"]) body[k] = body[k] || null;
      body.documentId = body.documentId || null;
      if (editing.id) await ndaApi.update(editing.id, body);
      else await ndaApi.save(body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Saves the form, then immediately fires the same "send" action the flow
  // button below does — one click for "this is ready, get it in front of
  // the client" instead of save-then-hunt-for-the-right-button.
  async function handleSaveAndSend(e) {
    e?.preventDefault?.();
    if (!editing.leadId) return setFormError("Pick which lead this NDA is with.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing };
      for (const k of ["sentAt", "signedAt", "expiresAt"]) body[k] = body[k] || null;
      body.documentId = body.documentId || null;
      const record = editing.id ? await ndaApi.update(editing.id, body) : await ndaApi.save(body);
      const sent = await ndaApi.advance(record.id, "send");
      setEditing(null);
      const who = record.lead?.company ?? "the client";
      if (sent.emailResult?.emailed) {
        setNotice(`Saved and emailed to ${who}.`);
      } else if (sent.emailResult) {
        setNotice(`Saved — not emailed (${sent.emailResult.reason}). Portal link: ${sent.emailResult.portalUrl}`);
      } else {
        setNotice(`Saved for ${who}.`);
      }
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // One click per step: the server stamps today onto the right field and
  // moves the status, so a reminder can never be logged without a date.
  // "Send" is also the one step that emails the client — see the
  // emailResult branch below.
  async function advance(record, step) {
    setBusyId(record.id);
    setNotice(null);
    try {
      const updated = await ndaApi.advance(record.id, step.action);
      const who = record.lead?.company ?? "this lead";
      if (updated.emailResult?.emailed) {
        setNotice(`Emailed to ${who}.`);
      } else if (updated.emailResult) {
        setNotice(`${step.label} recorded, but not emailed (${updated.emailResult.reason}). Portal link: ${updated.emailResult.portalUrl}`);
      } else {
        setNotice(`${step.label} recorded for ${who}.`);
      }
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(record) {
    const who = record.lead?.company ?? "this lead";
    if (!window.confirm(`Delete the NDA record for ${who}? This cannot be undone.`)) return;
    setBusyId(record.id);
    try {
      await ndaApi.remove(record.id);
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const cards = useMemo(
    () => [
      {
        label: "NDAs sent",
        value: String(metrics?.sent ?? 0),
        note: "Out for signature",
        noteTone: "blue"
      },
      {
        label: "Signed",
        value: String(metrics?.signed ?? 0),
        note: has(metrics?.signRate) ? `${metrics.signRate}% of sent` : "No sends yet",
        noteTone: "green"
      },
      {
        label: "Pending",
        value: String(metrics?.pending ?? 0),
        note: "Awaiting signature",
        noteTone: "amber"
      },
      {
        label: "Avg signing time",
        value: has(metrics?.avgSigningDays) ? `${metrics.avgSigningDays}d` : "—",
        note: has(metrics?.avgSigningDays) ? `${metrics.signedWithTiming} measured` : "Nothing signed yet",
        noteTone: "blue"
      },
      {
        label: "Reminder effect",
        value: has(metrics?.reminderEffectiveness) ? `${metrics.reminderEffectiveness}%` : "—",
        note: metrics?.remindersSent
          ? `${metrics.signedAfterReminder}/${metrics.remindersSent} signed after chasing`
          : "No reminders sent",
        noteTone: "amber"
      }
    ],
    [metrics]
  );

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          Relationships
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">NDA</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          Track every NDA from draft to signature, chase the ones that have gone quiet, and see whether the reminders
          are actually working.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle icon={CheckCircleIcon} iconClass="text-[#3046b2]" subtitle="Where every NDA currently sits.">
          Status flow
        </SectionTitle>
        <div className="mt-5 flex flex-wrap items-stretch gap-2">
          {FLOW.map((step, i) => {
            const count = records.filter((r) => r.status === step.status).length;
            return (
              <div key={step.status} className="flex items-stretch gap-2">
                <div className="min-w-[130px] rounded-[16px] border border-[#d6deea] bg-white px-4 py-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5c6b87]">{step.label}</p>
                  <p className="mt-2 text-[1.8rem] font-semibold leading-none tracking-[-0.03em] text-[#0f2042]">
                    {count}
                  </p>
                </div>
                {i < FLOW.length - 1 ? <span className="self-center text-[18px] text-[#9aa6bd]">-&gt;</span> : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Only rendered when something is actually waiting - an empty
          "nothing overdue" panel is just noise. */}
      {metrics?.overdue?.length ? (
        <Card className="px-5 py-5">
          <SectionTitle
            icon={CheckCircleIcon}
            iconClass="text-[#c47f1a]"
            subtitle="Longest wait first - these are the NDAs to chase today."
          >
            Waiting on signature
          </SectionTitle>
          <div className="mt-4 space-y-2">
            {metrics.overdue.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#f0e2c8] bg-[#fffaf0] px-4 py-3"
              >
                <span className="text-[14px] font-semibold text-[#102246]">{o.lead ?? "Unlinked lead"}</span>
                <span className="text-[13px] text-[#7a6a4a]">
                  {o.daysWaiting} day{o.daysWaiting === 1 ? "" : "s"} waiting · {o.remindersSent} reminder
                  {o.remindersSent === 1 ? "" : "s"} sent
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle="One NDA per lead - saving the same lead again updates it rather than adding a duplicate."
          action={
            <ActionButton
              label={editing ? "Cancel" : "Add NDA"}
              icon={editing ? XIcon : PlusIcon}
              small
              onClick={() => (editing ? setEditing(null) : startNew())}
            />
          }
        >
          NDA records
        </SectionTitle>

        {editing ? (
          <form onSubmit={handleSave} className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lead</label>
                <select
                  className={inputClass}
                  value={editing.leadId}
                  onChange={(e) => setEditing({ ...editing, leadId: e.target.value })}
                  disabled={Boolean(editing.id)}
                >
                  <option value="">Select a lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.company}
                    </option>
                  ))}
                </select>
                {leads.length === 0 ? (
                  <p className="mt-1 text-[12px] text-[#c47f1a]">No leads yet - add one in CRM Workspace first.</p>
                ) : null}
              </div>

              <div>
                <label className={labelClass}>Status</label>
                <select
                  className={inputClass}
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Sent date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.sentAt}
                  onChange={(e) => setEditing({ ...editing, sentAt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Signed date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.signedAt}
                  onChange={(e) => setEditing({ ...editing, signedAt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Expires</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.expiresAt}
                  onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Deal owner</label>
                <input
                  className={inputClass}
                  value={editing.owner}
                  onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                  placeholder="Who owns this on our side"
                />
              </div>
              <div>
                <label className={labelClass}>Signer name</label>
                <input
                  className={inputClass}
                  value={editing.signerName}
                  onChange={(e) => setEditing({ ...editing, signerName: e.target.value })}
                  placeholder="Who signs on their side"
                />
              </div>
              <div>
                <label className={labelClass}>Signer email</label>
                <input
                  className={inputClass}
                  value={editing.signerEmail}
                  onChange={(e) => setEditing({ ...editing, signerEmail: e.target.value })}
                  placeholder="name@company.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Attach the signed NDA (optional)</label>
                <select
                  className={inputClass}
                  value={editing.documentId}
                  onChange={(e) => setEditing({ ...editing, documentId: e.target.value })}
                >
                  <option value="">None</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.originalName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px] text-[#8592ab]">Pulled from the Data Room - upload it there first.</p>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-y`}
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Redlines, counterparty counsel, anything worth remembering"
                />
              </div>
            </div>

            {formError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton label={saving ? "Saving…" : "Save"} small onClick={handleSave} disabled={saving} />
              <ActionButton
                label={saving ? "Sending…" : "Send"}
                primary
                small
                onClick={handleSaveAndSend}
                disabled={saving}
              />
            </div>
          </form>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9aa6bd]" />
            <input
              className={`${inputClass} pl-10`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lead, company or signer"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                statusFilter === s ? "bg-[#21439b] text-white" : "border border-[#d6deea] bg-white text-[#4f6181]"
              }`}
            >
              {s === "All" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {notice ? <p className="mt-4 text-[13px] font-medium text-[#21439b]">{notice}</p> : null}
        {error ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <div className="mt-4 space-y-3">
          {loading ? <p className="text-[14px] text-[#5c6b87]">Loading…</p> : null}
          {!loading && records.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No NDA records yet. Add one to start tracking.
            </p>
          ) : null}

          {records.map((r) => (
            <div key={r.id} className="rounded-[16px] border border-[#e7edf5] bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-[#102246]">
                    {r.lead ? `${r.lead.name} — ${r.lead.company}` : "Unlinked lead"}
                  </p>
                  <p className="mt-1 text-[13px] text-[#5c6b87]">
                    Sent {fmtDate(r.sentAt)} · Signed {fmtDate(r.signedAt)} · Expires {fmtDate(r.expiresAt)}
                    {r.signerName ? ` · Signer ${r.signerName}` : ""}
                    {r.owner ? ` · Owner ${r.owner}` : ""}
                  </p>
                  {r.document ? (
                    <p className="mt-1 text-[12px] text-[#3046b2]">Attached: {r.document.originalName}</p>
                  ) : null}
                  {r.notes ? <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#4f6181]">{r.notes}</p> : null}
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {FLOW.map((step) => (
                  <ActionButton
                    key={step.action}
                    small
                    // Already-done steps stay visible as achieved rather than
                    // disappearing, so the NDA's history reads at a glance.
                    label={r[step.field] ? `${step.label} ✓` : step.label}
                    active={Boolean(r[step.field])}
                    disabled={busyId === r.id || Boolean(r[step.field])}
                    onClick={() => advance(r, step)}
                  />
                ))}
                <ActionButton small label="Edit" onClick={() => startEdit(r)} disabled={busyId === r.id} />
                <ActionButton small label="Delete" onClick={() => remove(r)} disabled={busyId === r.id} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
