import { useCallback, useEffect, useState } from "react";
import { dealStagesApi } from "../../lib/dealStagesApi";
import { leadsApi } from "../../lib/leadsApi";
import { documentsApi } from "../../lib/documentsApi";
import { outreachDoeApi } from "../../lib/outreachDoeApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, PlusIcon, SearchIcon, XIcon } from "../Icons";
import { FIELD_LABEL, FIELD_PLACEHOLDER, STAGE_CONFIG, STATUS_LABEL, STATUS_TONE } from "./stageConfig";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DECLINED", "ON_HOLD"];

const asDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");

// One screen serving NDA, IOI, Visit Planning, Field Visit and Term Sheet.
// They share a table and a lifecycle; STAGE_CONFIG decides which fields and
// labels each one shows.
export function DealStageModule({ stage }) {
  const config = STAGE_CONFIG[stage];
  // Most stages use the full 5-value status vocabulary; a stage's own
  // config can narrow it (see FIELD_VISIT in stageConfig.js) and relabel
  // whichever values it kept, without touching the shared enum or the
  // other stages that still use it in full.
  const stageStatuses = config.statuses ?? STATUSES;
  const stageStatusLabel = { ...STATUS_LABEL, ...config.statusLabels };

  const [records, setRecords] = useState([]);
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLeadId, setSearchLeadId] = useState("");
  const [searchOwner, setSearchOwner] = useState("");
  const [appliedLeadId, setAppliedLeadId] = useState("");
  const [appliedOwner, setAppliedOwner] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Uploading a new document directly from this form — a real upload, not
  // just picking one already sitting in the Data Room. Reuses the same
  // documentsApi.upload the Data Room screen itself uses, so the file
  // lands there too (leadId-scoped), not a second, separate store.
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState(null);
  // Real DOE names — same list Outreach/DOE's own scorecard is built from
  // (distinct EmailLead.owner values) — so "Owner" here picks from the
  // same real identities instead of free-typed, possibly-inconsistent text.
  const [doeNames, setDoeNames] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([dealStagesApi.list({ stage, status: statusFilter, q: query, leadId: appliedLeadId, owner: appliedOwner }), dealStagesApi.summary()])
      .then(([rows, sum]) => {
        setRecords(rows);
        setSummary(sum);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [stage, statusFilter, query, appliedLeadId, appliedOwner]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Leads populate the picker; documents let a signed NDA or term sheet be
  // attached from the Data Room. Both are optional extras — a failure here
  // shouldn't stop the stage list rendering.
  useEffect(() => {
    leadsApi.list().then(setLeads).catch(() => {});
    if (config.fields.includes("document")) {
      documentsApi.list().then(setDocuments).catch(() => {});
    }
    if (config.fields.includes("owner")) {
      outreachDoeApi.facets().then((f) => setDoeNames(f.does)).catch(() => {});
    }
  }, [config]);

  const startNew = () => {
    setDocumentUploadError(null);
    setEditing({
      leadId: "",
      status: "IN_PROGRESS",
      scheduledAt: "",
      completedAt: "",
      amount: "",
      valuation: "",
      location: "",
      attendees: "",
      counterparty: "",
      owner: "",
      clientRating: "",
      notes: "",
      documentId: ""
    });
  };

  const openSearch = () => {
    setEditing(null);
    setSearchOpen((open) => !open);
  };

  const applySearch = (e) => {
    e?.preventDefault();
    setAppliedLeadId(searchLeadId);
    setAppliedOwner(searchOwner);
    setSearchOpen(false);
  };

  const clearSearch = () => {
    setSearchLeadId("");
    setSearchOwner("");
    setAppliedLeadId("");
    setAppliedOwner("");
  };

  const startEdit = (r) => {
    setDocumentUploadError(null);
    setEditing({
      id: r.id,
      leadId: r.lead?.id ?? "",
      status: r.status,
      scheduledAt: asDateInput(r.scheduledAt),
      completedAt: asDateInput(r.completedAt),
      amount: r.amount ?? "",
      valuation: r.valuation ?? "",
      location: r.location ?? "",
      attendees: r.attendees ?? "",
      counterparty: r.counterparty ?? "",
      owner: r.owner ?? "",
      clientRating: r.clientRating ?? "",
      notes: r.notes ?? "",
      documentId: r.document?.id ?? ""
    });
  };

  // Uploads straight from this form via the real Data Room upload route —
  // the new document lands in the Data Room too (leadId-scoped), and is
  // immediately selected here, same as picking an existing one.
  const handleUploadDocument = async (file) => {
    if (!file) return;
    setDocumentUploading(true);
    setDocumentUploadError(null);
    try {
      const doc = await documentsApi.upload(file, { leadId: editing.leadId || undefined, category: config.label });
      setDocuments((current) => [doc, ...current]);
      setEditing((current) => ({ ...current, documentId: doc.id }));
    } catch (err) {
      setDocumentUploadError(err.message);
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!editing.leadId) {
      setFormError("Pick which lead this belongs to.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await dealStagesApi.save({
        ...editing,
        stage,
        clientRating: editing.clientRating === "" ? null : Number(editing.clientRating)
      });
      setEditing(null);
      setNotice(`${config.label} saved.`);
      load();
    } catch (err) {
      setFormError(typeof err.message === "string" ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    try {
      await dealStagesApi.remove(r.id);
      setRecords((prev) => prev.filter((x) => x.id !== r.id));
      setNotice("Removed.");
    } catch (err) {
      setError(err.message);
    }
  };

  const stageSummary = summary?.byStage?.[stage];
  const uses = (f) => config.fields.includes(f);

  return (
    <div className="space-y-5">
      <section>
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] ${config.accent}`}>
          {config.label}
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">{config.label}</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">{config.blurb}</p>

        {stageStatuses.length === 2 ? (
          // A stage restricted to just two real statuses (see
          // stageConfig.js's statuses/statusLabels — Field Visit and Term
          // Sheet both opted into this) gets a matching two-card summary
          // instead of the generic four-card one below.
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard card={{ label: stageStatusLabel.NOT_STARTED, value: String(stageSummary?.NOT_STARTED ?? 0), note: config.plannedNote ?? "Not started yet", noteTone: "amber" }} />
            <StatCard card={{ label: stageStatusLabel.COMPLETED, value: String(stageSummary?.COMPLETED ?? 0), note: "Done", noteTone: "green" }} />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard card={{ label: "Records", value: String(stageSummary?.total ?? 0), note: "At this stage", noteTone: "blue" }} />
            <StatCard card={{ label: "In progress", value: String(stageSummary?.IN_PROGRESS ?? 0), note: "Open now", noteTone: "amber" }} />
            <StatCard card={{ label: "Completed", value: String(stageSummary?.COMPLETED ?? 0), note: "Done", noteTone: "green" }} />
            <StatCard card={{ label: "Declined", value: String(stageSummary?.DECLINED ?? 0), note: "Not proceeding", noteTone: "red" }} />
          </div>
        )}
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle="One record per lead — saving the same lead again updates it rather than adding a duplicate."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ActionButton label={searchOpen ? "Close Search" : `Search ${config.label}`} icon={searchOpen ? XIcon : SearchIcon} small onClick={openSearch} />
              <ActionButton label={editing ? "Cancel" : `Add ${config.label}`} icon={editing ? XIcon : PlusIcon} small onClick={() => (editing ? setEditing(null) : startNew())} />
            </div>
          }
        >
          {config.label} records
        </SectionTitle>

        {searchOpen ? (
          <form onSubmit={applySearch} className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lead</label>
                <select className={inputClass} value={searchLeadId} onChange={(e) => setSearchLeadId(e.target.value)}>
                  <option value="">All leads</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} — {l.company}</option>
                  ))}
                </select>
              </div>

              {uses("owner") ? (
                <div>
                  <label className={labelClass}>Owner</label>
                  <select className={inputClass} value={searchOwner} onChange={(e) => setSearchOwner(e.target.value)}>
                    <option value="">All owners</option>
                    {doeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <p className="mt-3 text-[12px] text-[#8592ab]">
              Looking for location, attendees or notes instead? Use the search box below the filters.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton label="Apply search" icon={SearchIcon} primary small onClick={applySearch} />
              <ActionButton label="Clear" icon={XIcon} small onClick={clearSearch} />
            </div>
          </form>
        ) : null}

        {editing ? (
          <form onSubmit={handleSave} className="mt-5 rounded-[16px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Lead</label>
                <select className={inputClass} value={editing.leadId} onChange={(e) => setEditing({ ...editing, leadId: e.target.value })}>
                  <option value="">Select a lead…</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} — {l.company}</option>
                  ))}
                </select>
                {leads.length === 0 ? (
                  <p className="mt-1 text-[12px] text-[#c47f1a]">No leads yet — add one in CRM Workspace first.</p>
                ) : null}
              </div>

              <div>
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {stageStatuses.map((s) => (
                    <option key={s} value={s}>{stageStatusLabel[s]}</option>
                  ))}
                </select>
              </div>

              {uses("scheduledAt") ? (
                <div>
                  <label className={labelClass}>{config.scheduledLabel}</label>
                  <input type="date" className={inputClass} value={editing.scheduledAt} onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value })} />
                </div>
              ) : null}

              {uses("completedAt") ? (
                <div>
                  <label className={labelClass}>{config.completedLabel}</label>
                  <input type="date" className={inputClass} value={editing.completedAt} onChange={(e) => setEditing({ ...editing, completedAt: e.target.value })} />
                </div>
              ) : null}

              {["amount", "valuation", "location", "attendees", "counterparty"].filter(uses).map((f) => (
                <div key={f}>
                  <label className={labelClass}>{FIELD_LABEL[f]}</label>
                  <input className={inputClass} value={editing[f]} onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} placeholder={FIELD_PLACEHOLDER[f]} />
                </div>
              ))}

              {uses("owner") ? (
                <div>
                  <label className={labelClass}>{FIELD_LABEL.owner}</label>
                  <select className={inputClass} value={editing.owner} onChange={(e) => setEditing({ ...editing, owner: e.target.value })}>
                    <option value="">Select a DOE…</option>
                    {/* Keeps an existing value selectable even if it's since
                        fallen out of the live DOE list (e.g. no cold-outreach
                        leads currently assigned to them) rather than silently
                        blanking out real, already-saved data. */}
                    {editing.owner && !doeNames.includes(editing.owner) ? <option value={editing.owner}>{editing.owner}</option> : null}
                    {doeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {uses("clientRating") ? (
                <div>
                  <label className={labelClass}>{FIELD_LABEL.clientRating}</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    className={inputClass}
                    value={editing.clientRating}
                    onChange={(e) => setEditing({ ...editing, clientRating: e.target.value })}
                    placeholder={FIELD_PLACEHOLDER.clientRating}
                  />
                </div>
              ) : null}

              {uses("document") ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>Attach a document (optional)</label>
                  <select className={inputClass} value={editing.documentId} onChange={(e) => setEditing({ ...editing, documentId: e.target.value })}>
                    <option value="">None</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>{d.originalName}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      disabled={documentUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        handleUploadDocument(file);
                      }}
                      className="text-[13px] text-[#5f6f89] file:mr-3 file:rounded-[8px] file:border-0 file:bg-[#eef1ff] file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-[#3046b2]"
                    />
                    {documentUploading ? <span className="text-[12px] text-[#8592ab]">Uploading…</span> : null}
                  </div>
                  {documentUploadError ? <p className="mt-1 text-[12px] font-medium text-[#e0483f]">{documentUploadError}</p> : null}
                  <p className="mt-1 text-[12px] text-[#8592ab]">Upload a new file here, or pick one already in the Data Room above.</p>
                </div>
              ) : null}

              {uses("notes") ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>{FIELD_LABEL.notes}</label>
                  <textarea rows={3} className={`${inputClass} resize-y`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder={FIELD_PLACEHOLDER.notes} />
                </div>
              ) : null}
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
            <input className={`${inputClass} pl-10`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lead, company, contact or notes" />
          </div>
        </div>

        {appliedLeadId || appliedOwner ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[#5f6f89]">
            <span className="font-semibold text-[#334463]">Search filters:</span>
            {appliedLeadId ? <Badge tone="blue">{leads.find((l) => l.id === appliedLeadId)?.company ?? "Selected lead"}</Badge> : null}
            {appliedOwner ? <Badge tone="green">{appliedOwner}</Badge> : null}
            <button type="button" onClick={clearSearch} className="font-semibold text-[#3046b2] hover:underline">Clear</button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...stageStatuses].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                statusFilter === s ? "bg-[#3046b2] text-white" : "bg-[#eef1f7] text-[#4f6181] hover:bg-[#e2e8f2]"
              }`}
            >
              {s === "All" ? "All" : stageStatusLabel[s]}
            </button>
          ))}
        </div>

        {notice ? <p className="mt-3 text-[13px] font-medium text-[#2b9b60]">{notice}</p> : null}

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-[14px] text-[#8592ab]">Loading…</p>
          ) : error ? (
            <p className="text-[14px] text-[#e0483f]">{error}</p>
          ) : records.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#d6deea] px-5 py-10 text-center">
              <p className="text-[15px] font-medium text-[#102246]">
                {query || statusFilter !== "All" || appliedLeadId || appliedOwner ? "Nothing matches that filter." : `No ${config.label} records yet.`}
              </p>
              <p className="mt-1 text-[13px] text-[#8592ab]">
                {query || statusFilter !== "All" || appliedLeadId || appliedOwner ? "Try a different search or status." : config.emptyHint}
              </p>
            </div>
          ) : (
            records.map((r) => (
              <div key={r.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3 hover:bg-[#f8faff]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-medium text-[#102246]">
                        {r.lead ? `${r.lead.name} — ${r.lead.company}` : "Unlinked lead"}
                      </p>
                      <Badge tone={STATUS_TONE[r.status]}>{stageStatusLabel[r.status]}</Badge>
                      {r.document ? <Badge tone="blue">{r.document.originalName}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#8592ab]">
                      {config.scheduledLabel}: {fmtDate(r.scheduledAt)} · {config.completedLabel}: {fmtDate(r.completedAt)}
                      {r.amount ? ` · ${r.amount}` : ""}
                      {r.valuation ? ` @ ${r.valuation}` : ""}
                      {r.location ? ` · ${r.location}` : ""}
                      {r.owner ? ` · ${r.owner}` : ""}
                      {r.clientRating != null ? ` · Rated ${r.clientRating}/5` : ""}
                      {r.lead?.leadSource ? ` · Source: ${r.lead.leadSource}` : ""}
                    </p>
                    {r.notes ? <p className="mt-1 max-w-3xl text-[13px] leading-6 text-[#5f6f89]">{r.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ActionButton label="Edit" small onClick={() => startEdit(r)} />
                    <ActionButton label="Delete" icon={XIcon} small onClick={() => handleDelete(r)} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
