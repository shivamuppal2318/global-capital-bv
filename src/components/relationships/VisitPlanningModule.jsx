import { useCallback, useEffect, useMemo, useState } from "react";
import { visitPlansApi } from "../../lib/relationshipsApi";
import { leadsApi } from "../../lib/leadsApi";
import { documentsApi } from "../../lib/documentsApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, PlusIcon, SearchIcon, XIcon } from "../Icons";

const inputClass =
  "w-full rounded-[12px] border border-[#d6deea] bg-white px-3.5 py-2.5 text-[14px] text-[#102246] outline-none placeholder:text-[#9aa6bd] focus:border-[#3046b2]";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#334463]";

const STATUSES = ["PLANNED", "CONFIRMED", "COMPLETED", "CANCELLED"];
const STATUS_LABEL = { PLANNED: "Planned", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const STATUS_TONE = { PLANNED: "blue", CONFIRMED: "amber", COMPLETED: "green", CANCELLED: "red" };

const asDateInput = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const has = (v) => v !== null && v !== undefined;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function VisitPlanningModule() {
  const [plans, setPlans] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [calendar, setCalendar] = useState({});
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [query, setQuery] = useState("");
  // Lead/owner search criteria for the separate Search visit panel below —
  // draft values only take effect once "Search" is clicked, same pattern
  // as NdaModule/IoiModule's Search panels. Independent of `editing` (Plan
  // a visit / Edit), which is untouched.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLeadId, setSearchLeadId] = useState("");
  const [searchOwner, setSearchOwner] = useState("");
  const [appliedLeadId, setAppliedLeadId] = useState("");
  const [appliedOwner, setAppliedOwner] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      visitPlansApi.list({ status: statusFilter, region: regionFilter, q: query, leadId: appliedLeadId, owner: appliedOwner }),
      visitPlansApi.metrics(),
      visitPlansApi.calendar()
    ])
      .then(([rows, m, cal]) => {
        setPlans(rows);
        setMetrics(m);
        setCalendar(cal);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter, regionFilter, query, appliedLeadId, appliedOwner]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    leadsApi.list().then(setLeads).catch(() => {});
    documentsApi.list().then(setDocuments).catch(() => {});
  }, []);

  const startNew = () => {
    setSearchOpen(false);
    setEditing({
      leadId: "",
      status: "PLANNED",
      plannedFor: "",
      completedAt: "",
      location: "",
      region: "",
      country: "",
      attendees: "",
      purpose: "",
      travelMode: "",
      costAmount: "",
      costCurrency: "USD",
      owner: "",
      notes: "",
      reportSubmitted: false,
      reportId: ""
    });
  };

  const openSearch = () => {
    setEditing(null);
    setSearchOpen(true);
    setSearchLeadId(appliedLeadId);
    setSearchOwner(appliedOwner);
  };

  // Applies the panel's draft Lead/Owner criteria and closes it — Status
  // and Region already apply immediately via the pills/dropdown below, so
  // they aren't duplicated as separate drafts here.
  const applySearch = () => {
    setAppliedLeadId(searchLeadId);
    setAppliedOwner(searchOwner);
    setSearchOpen(false);
  };

  const startEdit = (p) => {
    setSearchOpen(false);
    setEditing({
      id: p.id,
      leadId: p.lead?.id ?? "",
      status: p.status,
      plannedFor: asDateInput(p.plannedFor),
      completedAt: asDateInput(p.completedAt),
      location: p.location ?? "",
      region: p.region ?? "",
      country: p.country ?? "",
      attendees: p.attendees ?? "",
      purpose: p.purpose ?? "",
      travelMode: p.travelMode ?? "",
      costAmount: p.costAmount ?? "",
      costCurrency: p.costCurrency ?? "USD",
      owner: p.owner ?? "",
      notes: p.notes ?? "",
      reportSubmitted: Boolean(p.reportSubmitted),
      reportId: p.report?.id ?? ""
    });
  };

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!editing.leadId) return setFormError("Pick which lead this visit is for.");
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...editing };
      for (const k of ["plannedFor", "completedAt"]) body[k] = body[k] || null;
      body.costAmount = body.costAmount === "" ? null : body.costAmount;
      body.reportId = body.reportId || null;
      if (editing.id) await visitPlansApi.update(editing.id, body);
      else await visitPlansApi.create(body);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Marking a visit done also stamps the completion date, so "completed" and
  // "completed on" can never disagree.
  async function markCompleted(p) {
    setBusyId(p.id);
    try {
      await visitPlansApi.update(p.id, { status: "COMPLETED", completedAt: new Date().toISOString() });
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleReport(p) {
    setBusyId(p.id);
    try {
      await visitPlansApi.update(p.id, { reportSubmitted: !p.reportSubmitted });
      load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p) {
    const who = p.lead?.company ?? "this lead";
    if (!window.confirm(`Delete the visit plan for ${who}? This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await visitPlansApi.remove(p.id);
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
        label: "Visits planned",
        value: String(metrics?.planned ?? 0),
        note: metrics?.upcoming ? `${metrics.upcoming} still upcoming` : "Nothing upcoming",
        noteTone: "blue"
      },
      {
        label: "Visits completed",
        value: String(metrics?.completed ?? 0),
        note: has(metrics?.completionRate) ? `${metrics.completionRate}% of planned` : "None yet",
        noteTone: "green"
      },
      {
        label: "Cost per visit",
        value: has(metrics?.costPerVisit) ? `$${metrics.costPerVisit.toLocaleString()}` : "—",
        note: metrics?.visitsWithCost ? `${metrics.visitsWithCost} visits costed` : "No costs recorded",
        noteTone: "amber"
      },
      {
        label: "Cluster efficiency",
        value: has(metrics?.clusterEfficiency) ? `${metrics.clusterEfficiency}%` : "—",
        note: "Visits sharing a geography",
        noteTone: "blue"
      },
      {
        label: "Reports submitted",
        value: has(metrics?.reportRate) ? `${metrics.reportRate}%` : "—",
        note: metrics?.completed ? `${metrics.reportsSubmitted}/${metrics.completed} completed visits` : "No visits done",
        noteTone: metrics?.reportRate === 100 ? "green" : "amber"
      }
    ],
    [metrics]
  );

  const regionOptions = useMemo(() => (metrics?.regions ?? []).map((r) => r.region), [metrics]);

  // Month grid, Monday-first (European convention, matching where these
  // visits actually happen).
  const calendarCells = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const leading = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, key, visits: calendar[key] ?? [] });
    }
    return cells;
  }, [month, calendar]);

  const shiftMonth = (delta) => {
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          Relationships
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
          Visit Planning
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          Plan counterparty visits, keep travel clustered by geography, track what each trip costs and make sure every
          completed visit comes back with a report.
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
          subtitle="Planned, confirmed and completed visits by date. Cancelled trips are left off."
          action={
            <div className="flex items-center gap-2">
              <ActionButton small label="←" onClick={() => shiftMonth(-1)} />
              <span className="min-w-[140px] text-center text-[14px] font-semibold text-[#102246]">
                {MONTH_NAMES[month.month]} {month.year}
              </span>
              <ActionButton small label="→" onClick={() => shiftMonth(1)} />
            </div>
          }
        >
          Visit calendar
        </SectionTitle>

        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c6b87]">
              {d}
            </div>
          ))}
          {calendarCells.map((cell, i) =>
            cell === null ? (
              <div key={`pad-${i}`} />
            ) : (
              <div
                key={cell.key}
                className={`min-h-[74px] rounded-[12px] border px-2 py-1.5 ${
                  cell.key === todayKey ? "border-[#3046b2] bg-[#f4f6ff]" : "border-[#e7edf5] bg-white"
                }`}
              >
                <span className="text-[12px] font-semibold text-[#5c6b87]">{cell.day}</span>
                <div className="mt-1 space-y-1">
                  {cell.visits.slice(0, 2).map((v) => (
                    <div
                      key={v.id}
                      title={`${v.lead ?? "Unlinked"}${v.location ? ` · ${v.location}` : ""}`}
                      className="truncate rounded-[6px] bg-[#eef2ff] px-1.5 py-0.5 text-[11px] font-medium text-[#21439b]"
                    >
                      {v.location || v.lead || "Visit"}
                    </div>
                  ))}
                  {cell.visits.length > 2 ? (
                    <div className="text-[11px] text-[#8592ab]">+{cell.visits.length - 2} more</div>
                  ) : null}
                </div>
              </div>
            )
          )}
        </div>
      </Card>


      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle="A lead can be visited more than once - each trip is its own record with its own cost and report."
          action={
            editing ? (
              <ActionButton label="Cancel" icon={XIcon} small onClick={() => setEditing(null)} />
            ) : searchOpen ? (
              <ActionButton label="Cancel" icon={XIcon} small onClick={() => setSearchOpen(false)} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Search visit" icon={SearchIcon} small onClick={openSearch} />
                <ActionButton label="Plan a visit" icon={PlusIcon} primary small onClick={startNew} />
              </div>
            )
          }
        >
          Visits
        </SectionTitle>

        {searchOpen ? (
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
                  placeholder="Filter by who is travelling"
                />
              </div>
            </div>
            <p className="mt-3 text-[12px] text-[#8592ab]">
              Looking for a location or purpose instead? Use the search box below the filters — it already covers
              that.
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
                <label className={labelClass}>Planned for</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.plannedFor}
                  onChange={(e) => setEditing({ ...editing, plannedFor: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Completed on</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editing.completedAt}
                  onChange={(e) => setEditing({ ...editing, completedAt: e.target.value })}
                />
              </div>

              <div>
                <label className={labelClass}>Location</label>
                <input
                  className={inputClass}
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  placeholder="City or site, e.g. Rotterdam HQ"
                />
              </div>
              <div>
                <label className={labelClass}>Region</label>
                <input
                  className={inputClass}
                  value={editing.region}
                  onChange={(e) => setEditing({ ...editing, region: e.target.value })}
                  placeholder="Benelux, DACH, MENA…"
                />
                <p className="mt-1 text-[12px] text-[#8592ab]">Drives cluster efficiency - keep the spelling consistent.</p>
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <input
                  className={inputClass}
                  value={editing.country}
                  onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                  placeholder="Netherlands"
                />
              </div>
              <div>
                <label className={labelClass}>Travel mode</label>
                <input
                  className={inputClass}
                  value={editing.travelMode}
                  onChange={(e) => setEditing({ ...editing, travelMode: e.target.value })}
                  placeholder="Flight, rail, car…"
                />
              </div>

              <div>
                <label className={labelClass}>Cost</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={editing.costAmount}
                    onChange={(e) => setEditing({ ...editing, costAmount: e.target.value })}
                    placeholder="0.00"
                  />
                  <select
                    className={`${inputClass} w-28`}
                    value={editing.costCurrency}
                    onChange={(e) => setEditing({ ...editing, costCurrency: e.target.value })}
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
                <label className={labelClass}>Owner</label>
                <input
                  className={inputClass}
                  value={editing.owner}
                  onChange={(e) => setEditing({ ...editing, owner: e.target.value })}
                  placeholder="Who is travelling"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Attendees</label>
                <input
                  className={inputClass}
                  value={editing.attendees}
                  onChange={(e) => setEditing({ ...editing, attendees: e.target.value })}
                  placeholder="Who is in the room, both sides"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Purpose</label>
                <input
                  className={inputClass}
                  value={editing.purpose}
                  onChange={(e) => setEditing({ ...editing, purpose: e.target.value })}
                  placeholder="Site inspection, management meeting, diligence…"
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Attach the visit report (optional)</label>
                <select
                  className={inputClass}
                  value={editing.reportId}
                  onChange={(e) => setEditing({ ...editing, reportId: e.target.value })}
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
                <label className="flex items-center gap-2 text-[14px] font-medium text-[#334463]">
                  <input
                    type="checkbox"
                    checked={editing.reportSubmitted}
                    onChange={(e) => setEditing({ ...editing, reportSubmitted: e.target.checked })}
                  />
                  Report submitted
                </label>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  rows={3}
                  className={`${inputClass} resize-y`}
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Agenda, logistics, anything worth remembering"
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
              placeholder="Search lead, company, location or purpose"
            />
          </div>
          {regionOptions.length ? (
            <select className={`${inputClass} max-w-[220px]`} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              <option value="All">All regions</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : null}
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
          {!loading && plans.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No visits planned yet.
            </p>
          ) : null}

          {plans.map((p) => (
            <div key={p.id} className="rounded-[16px] border border-[#e7edf5] bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-[#102246]">
                    {p.lead ? `${p.lead.name} — ${p.lead.company}` : "Unlinked lead"}
                  </p>
                  <p className="mt-1 text-[13px] text-[#5c6b87]">
                    Planned {fmtDate(p.plannedFor)} · Completed {fmtDate(p.completedAt)}
                    {p.location ? ` · ${p.location}` : ""}
                    {p.region ? ` · ${p.region}` : ""}
                    {has(p.costAmount) ? ` · ${p.costCurrency} ${p.costAmount.toLocaleString()}` : ""}
                    {p.owner ? ` · ${p.owner}` : ""}
                  </p>
                  {p.purpose ? <p className="mt-1 text-[13px] text-[#4f6181]">Purpose: {p.purpose}</p> : null}
                  {p.report ? <p className="mt-1 text-[12px] text-[#3046b2]">Report: {p.report.originalName}</p> : null}
                  {p.notes ? <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#4f6181]">{p.notes}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  <Badge tone={p.reportSubmitted ? "green" : "slate"}>
                    Report {p.reportSubmitted ? "Yes" : "No"}
                  </Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.status !== "COMPLETED" && p.status !== "CANCELLED" ? (
                  <ActionButton small label="Mark completed" onClick={() => markCompleted(p)} disabled={busyId === p.id} />
                ) : null}
                <ActionButton
                  small
                  label={p.reportSubmitted ? "Undo report" : "Report submitted"}
                  active={p.reportSubmitted}
                  onClick={() => toggleReport(p)}
                  disabled={busyId === p.id}
                />
                <ActionButton small label="Edit" onClick={() => startEdit(p)} disabled={busyId === p.id} />
                <ActionButton small label="Delete" onClick={() => remove(p)} disabled={busyId === p.id} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
