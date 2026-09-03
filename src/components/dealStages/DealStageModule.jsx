import { useCallback, useEffect, useState } from "react";
import { dealStagesApi } from "../../lib/dealStagesApi";
import { leadsApi } from "../../lib/leadsApi";
import { documentsApi } from "../../lib/documentsApi";
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

  const [records, setRecords] = useState([]);
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
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

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([dealStagesApi.list({ stage, status: statusFilter, q: query }), dealStagesApi.summary()])
      .then(([rows, sum]) => {
        setRecords(rows);
        setSummary(sum);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [stage, statusFilter, query]);

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
  }, [config]);

  // Field Visit's "Conversion to TS %" KPI needs to know, of the leads
  // visited, how many also have a Term Sheet record — a cross-stage
  // question the shared /summary endpoint (aggregate counts only) can't
  // answer, so it's fetched directly here rather than added as generic
  // plumbing every other stage would carry for nothing.
  const [termSheetLeadIds, setTermSheetLeadIds] = useState(new Set());
  useEffect(() => {
    if (stage !== "FIELD_VISIT") return;
    dealStagesApi
      .list({ stage: "TERM_SHEET" })
      .then((rows) => setTermSheetLeadIds(new Set(rows.map((r) => r.lead?.id).filter(Boolean))))
      .catch(() => {});
  }, [stage]);

  // Mirror image for Term Sheet's own "IOI → TS conversion" KPI.
  const [ioiLeadIds, setIoiLeadIds] = useState(new Set());
  useEffect(() => {
    if (stage !== "TERM_SHEET") return;
    dealStagesApi
      .list({ stage: "IOI" })
      .then((rows) => setIoiLeadIds(new Set(rows.map((r) => r.lead?.id).filter(Boolean))))
      .catch(() => {});
  }, [stage]);

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

  // Field Visit KPI Framework numbers — all real, computed from the records
  // already loaded for this stage (scheduledAt = visit date, completedAt =
  // report filed, per STAGE_CONFIG.FIELD_VISIT's labels).
  let fieldVisitKpis = null;
  if (stage === "FIELD_VISIT") {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const visitsThisWeek = records.filter((r) => r.scheduledAt && now - new Date(r.scheduledAt).getTime() <= weekMs).length;

    const reported = records.filter((r) => r.completedAt);
    const reportsSubmittedPct = records.length > 0 ? Math.round((reported.length / records.length) * 100) : 0;

    const reportTimes = records
      .filter((r) => r.scheduledAt && r.completedAt)
      .map((r) => (new Date(r.completedAt).getTime() - new Date(r.scheduledAt).getTime()) / (1000 * 60 * 60));
    const avgReportHours = reportTimes.length > 0 ? Math.round(reportTimes.reduce((a, b) => a + b, 0) / reportTimes.length) : null;

    const rated = records.filter((r) => r.clientRating != null);
    const avgRating = rated.length > 0 ? (rated.reduce((sum, r) => sum + r.clientRating, 0) / rated.length).toFixed(1) : null;

    const visitedLeadIds = new Set(records.map((r) => r.lead?.id).filter(Boolean));
    const convertedCount = [...visitedLeadIds].filter((id) => termSheetLeadIds.has(id)).length;
    const conversionPct = visitedLeadIds.size > 0 ? Math.round((convertedCount / visitedLeadIds.size) * 100) : 0;

    fieldVisitKpis = { visitsThisWeek, reportsSubmittedPct, avgReportHours, avgRating, conversionPct };
  }

  // Term Sheet KPI Framework: signed count + total value are already real
  // via the generic "Completed" stat tile and each record's own amount —
  // amount is deliberately free text ("EUR 2-4M", "TBC"), so it isn't
  // summed into a fabricated total here. IOI → TS conversion and the top
  // performer (by owner/DOE, matching "Originating DOE" traceability) are
  // real aggregates over what's actually on these records.
  let termSheetKpis = null;
  if (stage === "TERM_SHEET") {
    const tsLeadIds = new Set(records.map((r) => r.lead?.id).filter(Boolean));
    const convertedFromIoi = [...tsLeadIds].filter((id) => ioiLeadIds.has(id)).length;
    const ioiConversionPct = ioiLeadIds.size > 0 ? Math.round((convertedFromIoi / ioiLeadIds.size) * 100) : 0;

    const signedByOwner = new Map();
    for (const r of records) {
      if (r.status !== "COMPLETED" || !r.owner) continue;
      signedByOwner.set(r.owner, (signedByOwner.get(r.owner) ?? 0) + 1);
    }
    let topPerformer = null;
    for (const [owner, count] of signedByOwner) {
      if (!topPerformer || count > topPerformer.count) topPerformer = { owner, count };
    }

    termSheetKpis = { ioiConversionPct, topPerformer };
  }

  return (
    <div className="space-y-5">
      <section>
        <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] ${config.accent}`}>
          {config.label}
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">{config.label}</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">{config.blurb}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <StatCard card={{ label: "Records", value: String(stageSummary?.total ?? 0), note: "At this stage", noteTone: "blue" }} />
          <StatCard card={{ label: "In progress", value: String(stageSummary?.IN_PROGRESS ?? 0), note: "Open now", noteTone: "amber" }} />
          <StatCard card={{ label: "Completed", value: String(stageSummary?.COMPLETED ?? 0), note: "Done", noteTone: "green" }} />
          <StatCard card={{ label: "Declined", value: String(stageSummary?.DECLINED ?? 0), note: "Not proceeding", noteTone: "red" }} />
        </div>

        {fieldVisitKpis ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard
              card={{ label: "Visits this week", value: String(fieldVisitKpis.visitsThisWeek), note: "Target: 8/week", noteTone: fieldVisitKpis.visitsThisWeek >= 8 ? "green" : "amber" }}
            />
            <StatCard
              card={{
                label: "Reports submitted",
                value: `${fieldVisitKpis.reportsSubmittedPct}%`,
                note: "Target: 100%",
                noteTone: fieldVisitKpis.reportsSubmittedPct === 100 ? "green" : "amber"
              }}
            />
            <StatCard
              card={{
                label: "Avg report time",
                value: fieldVisitKpis.avgReportHours != null ? `${fieldVisitKpis.avgReportHours}h` : "—",
                note: "Target: <24h",
                noteTone: fieldVisitKpis.avgReportHours != null && fieldVisitKpis.avgReportHours < 24 ? "green" : "amber"
              }}
            />
            <StatCard
              card={{
                label: "Client rating",
                value: fieldVisitKpis.avgRating ?? "—",
                note: "Target: 4.5+",
                noteTone: fieldVisitKpis.avgRating != null && Number(fieldVisitKpis.avgRating) >= 4.5 ? "green" : "amber"
              }}
            />
            <StatCard card={{ label: "Conversion to TS", value: `${fieldVisitKpis.conversionPct}%`, note: "Visited → term sheet", noteTone: "violet" }} />
          </div>
        ) : null}

        {termSheetKpis ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <StatCard card={{ label: "IOI → Term Sheet", value: `${termSheetKpis.ioiConversionPct}%`, note: "Of leads with an IOI", noteTone: "violet" }} />
            <StatCard
              card={{
                label: "Top performer",
                value: termSheetKpis.topPerformer ? termSheetKpis.topPerformer.owner : "—",
                note: termSheetKpis.topPerformer ? `${termSheetKpis.topPerformer.count} signed` : "No signed term sheets yet",
                noteTone: "green"
              }}
            />
          </div>
        ) : null}
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle="One record per lead — saving the same lead again updates it rather than adding a duplicate."
          action={<ActionButton label={editing ? "Cancel" : `Add ${config.label}`} icon={editing ? XIcon : PlusIcon} small onClick={() => (editing ? setEditing(null) : startNew())} />}
        >
          {config.label} records
        </SectionTitle>

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
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
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

              {["amount", "valuation", "location", "attendees", "counterparty", "owner"].filter(uses).map((f) => (
                <div key={f}>
                  <label className={labelClass}>{FIELD_LABEL[f]}</label>
                  <input className={inputClass} value={editing[f]} onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} placeholder={FIELD_PLACEHOLDER[f]} />
                </div>
              ))}

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

        <div className="mt-3 flex flex-wrap gap-1.5">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                statusFilter === s ? "bg-[#3046b2] text-white" : "bg-[#eef1f7] text-[#4f6181] hover:bg-[#e2e8f2]"
              }`}
            >
              {s === "All" ? "All" : STATUS_LABEL[s]}
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
                {query || statusFilter !== "All" ? "Nothing matches that filter." : `No ${config.label} records yet.`}
              </p>
              <p className="mt-1 text-[13px] text-[#8592ab]">
                {query || statusFilter !== "All" ? "Try a different search or status." : config.emptyHint}
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
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
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
