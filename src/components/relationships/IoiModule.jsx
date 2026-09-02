import { useCallback, useEffect, useMemo, useState } from "react";
import { ioiApi } from "../../lib/relationshipsApi";
import { leadsApi } from "../../lib/leadsApi";
import { documentsApi } from "../../lib/documentsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, PlusIcon, SearchIcon, XIcon } from "../Icons";
import { useAuth } from "../../context/AuthContext";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const STATUSES = ["DRAFT", "GENERATED", "SENT", "SIGNED", "DECLINED", "EXPIRED"];

const STATUS_LABEL = {
  DRAFT: "Draft",
  GENERATED: "Generated",
  SENT: "Sent",
  SIGNED: "Signed",
  DECLINED: "Declined",
  EXPIRED: "Expired"
};

const STATUS_TONE = {
  DRAFT: "slate",
  GENERATED: "blue",
  SENT: "amber",
  SIGNED: "green",
  DECLINED: "red",
  EXPIRED: "red"
};

const FLOW = [
  { label: "Generate", action: "generate", field: "generatedAt" },
  { label: "Send", action: "send", field: "sentAt" },
  { label: "Sign", action: "sign", field: "signedAt" }
];

const asDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const has = (v) => v !== null && v !== undefined;

// Money reads better abbreviated at these magnitudes: an average IOI is
// millions, and "€3,000,000" in a KPI tile wraps and loses its shape.
function fmtMoney(value, currency = "EUR") {
  if (!has(value)) return "—";
  const symbol = { EUR: "€", USD: "$", GBP: "£" }[currency] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}k`;
  return `${symbol}${value.toLocaleString()}`;
}

export function IoiModule() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  // Lead/owner search criteria — draft values live in the Search IOI panel
  // and only take effect once "Search" is clicked, unlike statusFilter/query
  // above which apply immediately. Same split as NdaModule's Search panel.
  const [searchLeadId, setSearchLeadId] = useState("");
  const [searchOwner, setSearchOwner] = useState("");
  const [appliedLeadId, setAppliedLeadId] = useState("");
  const [appliedOwner, setAppliedOwner] = useState("");
  const [editing, setEditing] = useState(null);
  // "edit" is the comprehensive editor (per-record Edit) — every field.
  // "quick" is the lean creation form (Add IOI button) — Lead, Owner, IOI
  // value, Generated date, Expires date, Attach IOI document. "search" is
  // the Search IOI filter panel — not tied to any one record.
  const [formMode, setFormMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      ioiApi.list({ status: statusFilter, q: query, leadId: appliedLeadId, owner: appliedOwner }),
      ioiApi.metrics()
    ])
      .then(([rows, m]) => {
        setRecords(rows);
        setMetrics(m);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter, query, appliedLeadId, appliedOwner]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    leadsApi.list().then(setLeads).catch(() => {});
    documentsApi.list({ category: "IOI" }).then(setDocuments).catch(() => {});
  }, []);

  const blankRecord = () => ({
    leadId: "",
    status: "DRAFT",
    generatedAt: "",
    sentAt: "",
    signedAt: "",
    expiresAt: "",
    value: "",
    valueCurrency: "EUR",
    industry: "",
    geography: "",
    counterparty: "",
    owner: user?.name ?? "",
    notes: "",
    documentId: ""
  });

  const startQuickAdd = () => {
    setFormMode("quick");
    setEditing(blankRecord());
  };

  const openSearch = () => {
    setFormMode("search");
    setSearchLeadId(appliedLeadId);
    setSearchOwner(appliedOwner);
  };

  // Applies the panel's draft Lead/Owner criteria and closes it — Status
  // already applies immediately via the pills below, so it isn't
  // duplicated as a separate draft here.
  const applySearch = () => {
    setAppliedLeadId(searchLeadId);
    setAppliedOwner(searchOwner);
    setFormMode(null);
  };

  const startEdit = (r) => {
    setFormMode("edit");
    setEditing({
      id: r.id,
      leadId: r.lead?.id ?? "",
      status: r.status,
      generatedAt: asDateInput(r.generatedAt),
      sentAt: asDateInput(r.sentAt),
      signedAt: asDateInput(r.signedAt),
      expiresAt: asDateInput(r.expiresAt),
      value: r.value ?? "",
      valueCurrency: r.valueCurrency ?? "EUR",
      industry: r.industry ?? "",
      geography: r.geography ?? "",
      counterparty: r.counterparty ?? "",
      owner: r.owner ?? "",
      notes: r.notes ?? "",
      documentId: r.document?.id ?? ""
    });
  };

  const closeForm = () => {
    setEditing(null);
    setFormMode(null);
  };

  // Once signed, r.document is either the client's own uploaded copy or
  // (if they filled the form in online instead) still the blank template —
  // either way, it's a real file worth being able to pull up.
  const handleDownloadDocument = async (doc) => {
    try {
      await documentsApi.open(doc, { download: true });
    } catch (err) {
      setError(err.message);
    }
  };

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!editing.leadId) return setFormError("Pick which lead this IOI is for.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing };
      for (const k of ["generatedAt", "sentAt", "signedAt", "expiresAt"]) body[k] = body[k] || null;
      body.value = body.value === "" ? null : body.value;
      body.documentId = body.documentId || null;
      if (editing.id) await ioiApi.update(editing.id, body);
      else await ioiApi.save(body);
      closeForm();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Saves the form, then immediately fires "generate" — the first real step
  // in the IOI lifecycle (Generate -> Send -> Sign), same idea as the NDA
  // quick form's Save/Send pair. Unlike NDA's "send", IOI's actions don't
  // email anyone — they're internal status/timestamp advances only, so
  // "Generate" is the honest equivalent, not "Send".
  async function handleSaveAndGenerate(e) {
    e?.preventDefault?.();
    if (!editing.leadId) return setFormError("Pick which lead this IOI is for.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing };
      for (const k of ["generatedAt", "sentAt", "signedAt", "expiresAt"]) body[k] = body[k] || null;
      body.value = body.value === "" ? null : body.value;
      body.documentId = body.documentId || null;
      const record = editing.id ? await ioiApi.update(editing.id, body) : await ioiApi.save(body);
      await ioiApi.advance(record.id, "generate");
      closeForm();
      setNotice(`Saved and generated for ${record.lead?.company ?? "the client"}.`);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function advance(record, step) {
    setBusyId(record.id);
    setNotice(null);
    try {
      await ioiApi.advance(record.id, step.action);
      setNotice(`${step.label} recorded for ${record.lead?.company ?? "this lead"}.`);
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(record) {
    const who = record.lead?.company ?? "this lead";
    if (!window.confirm(`Delete the IOI record for ${who}? This cannot be undone.`)) return;
    setBusyId(record.id);
    try {
      await ioiApi.remove(record.id);
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
        label: "IOIs generated",
        value: String(metrics?.generated ?? 0),
        note: metrics?.pending ? `${metrics.pending} still open` : "None open",
        noteTone: "blue"
      },
      {
        label: "IOIs signed",
        value: String(metrics?.signed ?? 0),
        note: has(metrics?.signRate) ? `${metrics.signRate}% of generated` : "None generated yet",
        noteTone: "green"
      },
      {
        label: "Avg IOI value",
        value: fmtMoney(metrics?.avgValue),
        note: metrics?.pricedCount ? `${metrics.pricedCount} priced` : "No values recorded",
        noteTone: "amber"
      },
      {
        label: "Total IOI value",
        value: fmtMoney(metrics?.totalValue),
        note: "Across priced IOIs",
        noteTone: "blue"
      },
      {
        label: "Declined",
        value: String(metrics?.declined ?? 0),
        note: "Not proceeding",
        noteTone: "red"
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
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">IOI</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          Investment readiness — the non-binding ranges put to each counterparty, what they are worth, and where that
          interest is concentrated.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle="One IOI per lead - saving the same lead again updates it rather than adding a duplicate."
          action={
            formMode ? (
              <ActionButton label="Cancel" icon={XIcon} small onClick={closeForm} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Search IOI" icon={SearchIcon} small onClick={openSearch} />
                <ActionButton label="Add IOI" icon={PlusIcon} primary small onClick={startQuickAdd} />
              </div>
            )
          }
        >
          IOI records
        </SectionTitle>

        {formMode === "search" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              applySearch();
            }}
            className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lead</label>
                <select className={inputClass} value={searchLeadId} onChange={(e) => setSearchLeadId(e.target.value)}>
                  <option value="">Any lead</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.company}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="All">Any status</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Owner</label>
                <input
                  className={inputClass}
                  value={searchOwner}
                  onChange={(e) => setSearchOwner(e.target.value)}
                  placeholder="Filter by deal owner"
                />
              </div>
            </div>
            <p className="mt-3 text-[12px] text-[#8592ab]">
              Looking for a counterparty signatory or note instead? Use the search box below the filters — it
              already covers that.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                label="Clear"
                small
                onClick={() => {
                  setSearchLeadId("");
                  setSearchOwner("");
                  setStatusFilter("All");
                  setAppliedLeadId("");
                  setAppliedOwner("");
                }}
              />
              <ActionButton label="Search" primary small onClick={applySearch} />
            </div>
          </form>
        ) : null}

        {editing && formMode === "quick" ? (
          <form onSubmit={handleSave} className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lead</label>
                <select
                  className={inputClass}
                  value={editing.leadId}
                  onChange={(e) => setEditing({ ...editing, leadId: e.target.value })}
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
                <label className={labelClass}>Owner</label>
                <input
                  className={inputClass}
                  value={editing.owner}
                  onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                  placeholder="Who owns this on our side"
                />
              </div>

              <div>
                <label className={labelClass}>IOI value</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    className={inputClass}
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    placeholder="2000000"
                  />
                  <select
                    className={`${inputClass} w-28`}
                    value={editing.valueCurrency}
                    onChange={(e) => setEditing({ ...editing, valueCurrency: e.target.value })}
                  >
                    {["EUR", "USD", "GBP", "AED", "INR"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>Generated date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.generatedAt}
                  onChange={(e) => setEditing({ ...editing, generatedAt: e.target.value })}
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
                <label className={labelClass}>Attach IOI document</label>
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
            </div>

            {formError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton label={saving ? "Saving…" : "Save"} small onClick={handleSave} disabled={saving} />
              <ActionButton
                label={saving ? "Generating…" : "Generate"}
                primary
                small
                onClick={handleSaveAndGenerate}
                disabled={saving}
              />
            </div>
          </form>
        ) : null}

        {editing && formMode === "edit" ? (
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
                <label className={labelClass}>IOI value</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    className={inputClass}
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    placeholder="2000000"
                  />
                  <select
                    className={`${inputClass} w-28`}
                    value={editing.valueCurrency}
                    onChange={(e) => setEditing({ ...editing, valueCurrency: e.target.value })}
                  >
                    {["EUR", "USD", "GBP", "AED", "INR"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-[12px] text-[#8592ab]">
                  A single figure so it can be averaged. For a range, put the midpoint here and the range in notes.
                </p>
              </div>

              <div>
                <label className={labelClass}>Owner</label>
                <input
                  className={inputClass}
                  value={editing.owner}
                  onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                  placeholder="Who owns this on our side"
                />
              </div>

              <div>
                <label className={labelClass}>Industry</label>
                <input
                  className={inputClass}
                  value={editing.industry}
                  onChange={(e) => setEditing({ ...editing, industry: e.target.value })}
                  placeholder="Renewables, Logistics, Healthcare…"
                  list="ioi-industries"
                />
                <datalist id="ioi-industries">
                  {(metrics?.byIndustry ?? [])
                    .filter((r) => r.label !== "Unspecified")
                    .map((r) => (
                      <option key={r.label} value={r.label} />
                    ))}
                </datalist>
                <p className="mt-1 text-[12px] text-[#8592ab]">Drives the distribution - keep the spelling consistent.</p>
              </div>

              <div>
                <label className={labelClass}>Geography</label>
                <input
                  className={inputClass}
                  value={editing.geography}
                  onChange={(e) => setEditing({ ...editing, geography: e.target.value })}
                  placeholder="Benelux, DACH, MENA…"
                  list="ioi-geographies"
                />
                <datalist id="ioi-geographies">
                  {(metrics?.byGeography ?? [])
                    .filter((r) => r.label !== "Unspecified")
                    .map((r) => (
                      <option key={r.label} value={r.label} />
                    ))}
                </datalist>
              </div>

              <div>
                <label className={labelClass}>Generated</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.generatedAt}
                  onChange={(e) => setEditing({ ...editing, generatedAt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Sent</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.sentAt}
                  onChange={(e) => setEditing({ ...editing, sentAt: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Signed</label>
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

              <div className="md:col-span-2">
                <label className={labelClass}>Counterparty signatory</label>
                <input
                  className={inputClass}
                  value={editing.counterparty}
                  onChange={(e) => setEditing({ ...editing, counterparty: e.target.value })}
                  placeholder="Who signs on their side"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Attach the IOI document (optional)</label>
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
                  placeholder="The range as quoted, conditions, anything worth remembering"
                />
              </div>
            </div>

            {formError ? <p className="mt-3 text-[13px] font-medium text-[#e0483f]">{formError}</p> : null}
            <div className="mt-4">
              <ActionButton label={saving ? "Saving…" : "Save"} primary small onClick={handleSave} disabled={saving} />
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
              placeholder="Search lead, company, signatory or notes"
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
              No IOI records yet. Log one once you have put a range to a counterparty.
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
                    {has(r.value) ? `${fmtMoney(r.value, r.valueCurrency)} · ` : ""}
                    Generated {fmtDate(r.generatedAt)} · Sent {fmtDate(r.sentAt)} · Signed {fmtDate(r.signedAt)}
                    {r.owner ? ` · Owner ${r.owner}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.industry ? <Badge tone="blue">{r.industry}</Badge> : null}
                    {r.geography ? <Badge tone="slate">{r.geography}</Badge> : null}
                  </div>
                  {r.document ? (
                    r.status === "SIGNED" ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadDocument(r.document)}
                        className="mt-1 text-[12px] font-semibold text-[#3046b2] underline decoration-dotted hover:text-[#21439b]"
                      >
                        Download Signed IOI
                      </button>
                    ) : (
                      <p className="mt-1 text-[12px] text-[#3046b2]">Attached: {r.document.originalName}</p>
                    )
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
