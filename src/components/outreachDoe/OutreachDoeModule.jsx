import { useCallback, useEffect, useMemo, useState } from "react";
import { outreachDoeApi } from "../../lib/outreachDoeApi";
import { useAuth } from "../../context/AuthContext";
import { ActionButton, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, GridIcon, RadarIcon } from "../Icons";

const inputClass =
  "w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#102246] outline-none focus:border-[#3046b2]";

const has = (v) => v !== null && v !== undefined;
const fmtPct = (v) => (has(v) ? `${v}%` : "—");
const fmtNum = (v) => (has(v) ? String(v) : "—");

const EMPTY_FILTERS = { doe: "", geography: "", leadSource: "", dateFrom: "", dateTo: "", industry: "" };

export function OutreachDoeModule() {
  const { user } = useAuth();
  // A non-admin only ever sees their own numbers here (enforced server-side
  // too, in routes/outreachDoe.js -- this isn't just a UI nicety). Locking
  // the filter itself to their name, rather than leaving "All DOEs" and a
  // picker that silently gets overridden, is what keeps the screen honest
  // about what it's actually showing them.
  const isAdmin = user?.role === "ADMIN";
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState(() => (isAdmin ? EMPTY_FILTERS : { ...EMPTY_FILTERS, doe: user?.name ?? "" }));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    outreachDoeApi.facets().then(setFacets).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    outreachDoeApi
      .get(filters)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(load, [load]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  // A non-admin's own name in `doe` isn't a filter they applied, it's just
  // who they are -- doesn't count toward the badge, and Reset restores it
  // instead of clearing it back to a misleading "All DOEs".
  const activeCount = Object.entries(filters).filter(([k, v]) => (isAdmin || k !== "doe") && Boolean(v)).length;
  const reset = () => setFilters(isAdmin ? EMPTY_FILTERS : { ...EMPTY_FILTERS, doe: user?.name ?? "" });

  // The scorecard row to show against target: the selected DOE's own
  // numbers, or the combined total across everyone when no DOE is picked.
  const scoped = useMemo(() => {
    if (!data) return null;
    if (filters.doe) return data.scorecard.find((r) => r.doe === filters.doe) ?? data.overall;
    return data.overall;
  }, [data, filters.doe]);

  const scorecardRows = useMemo(() => {
    if (!data || !scoped) return [];
    const k = data.pipelineKpis;
    // Same funnel-stage numbers Executive Dashboard shows (lib/executiveKpis.js
    // computes both), not attributable to a single DOE — no CRM lead's
    // NDA/Zoom/Data Room/IOI/Field Visit/Term Sheet record is linked to
    // whichever rep sent the original cold email, so these are company-wide
    // pipeline health, shown here for the same at-a-glance convenience.
    const pipelineNote = "Company-wide — matches Executive Dashboard, not linked to a single DOE";
    return [
      { key: "outreachPerDay", label: "Outreach/Day", actual: scoped.outreachPerDay, unit: "" },
      { key: "positiveResponseRate", label: "Positive Response %", actual: scoped.positiveResponseRate, unit: "%" },
      { key: "coldEmailOpenRate", label: "Cold Email Open Rate", actual: scoped.coldEmailOpenRate, unit: "%" },
      { key: "whatsappReplyRate", label: "WhatsApp Reply Rate", actual: data.companyWide.whatsappReplyRate, unit: "%", note: "Company-wide — WhatsApp agents aren't linked to a DOE yet" },
      { key: "zoomCallsPerDay", label: "Zoom Call Booked", actual: data.companyWide.zoomCallsPerDay, unit: "/day", note: "Company-wide — meetings aren't linked to a DOE yet" },
      { key: "responseRate", label: "Response Rate", format: () => fmtPct(k?.responseRate), note: pipelineNote },
      { key: "ndaConversion", label: "NDA Conversion", format: () => fmtPct(k?.ndaConversion), note: pipelineNote },
      { key: "zoomConversion", label: "Zoom Call 1", format: () => fmtPct(k?.zoomConversion), note: pipelineNote },
      { key: "dataRoomCompletion", label: "Data Room", format: () => fmtPct(k?.dataRoomCompletion), note: pipelineNote },
      { key: "ioiConversion", label: "IOI Signed", format: () => fmtPct(k?.ioiConversion), note: pipelineNote },
      { key: "zoomCall2Conversion", label: "Zoom Call 2", format: () => fmtPct(k?.zoomCall2Conversion), note: pipelineNote },
      { key: "fieldVisitCompletion", label: "Field Visit", format: () => fmtPct(k?.fieldVisitCompletion), note: pipelineNote },
      { key: "termSheetConversion", label: "Term Sheet Closed", format: () => fmtPct(k?.termSheetConversion), note: pipelineNote }
    ];
  }, [data, scoped]);

  // Same ten company-wide pipeline numbers as the Scorecard rows above,
  // reshaped into columns for the per-rep compression table below — every
  // DOE's row repeats the same value, same convention WhatsApp Reply Rate
  // and Zoom Call Booked already use there.
  const pipelineColumns = useMemo(() => {
    const k = data?.pipelineKpis;
    return [
      { key: "responseRate", label: "Response Rate", value: fmtPct(k?.responseRate) },
      { key: "ndaConversion", label: "NDA Conversion", value: fmtPct(k?.ndaConversion) },
      { key: "zoomConversion", label: "Zoom Call 1", value: fmtPct(k?.zoomConversion) },
      { key: "dataRoomCompletion", label: "Data Room", value: fmtPct(k?.dataRoomCompletion) },
      { key: "ioiConversion", label: "IOI Signed", value: fmtPct(k?.ioiConversion) },
      { key: "zoomCall2Conversion", label: "Zoom Call 2", value: fmtPct(k?.zoomCall2Conversion) },
      { key: "fieldVisitCompletion", label: "Field Visit", value: fmtPct(k?.fieldVisitCompletion) },
      { key: "termSheetConversion", label: "Term Sheet Closed", value: fmtPct(k?.termSheetConversion) }
    ];
  }, [data]);

  const cards = useMemo(
    () => [
      // Despite the field's own internal name (outreachSent), this counts
      // distinct leads in this DOE's outreach pipeline, not real send
      // events -- a lead sits here the moment it's assigned, whether or not
      // any email has actually gone out yet (e.g. queue disabled, no
      // cadence steps configured). Labeling it "sent"/"Emails sent" implied
      // real delivery and didn't match Email Automation's own Sent count,
      // which correctly only counts BRANCH_EMAIL_SENT/CAMPAIGN_BLAST_SENT.
      { label: "Leads in Outreach", value: fmtNum(data?.top.outreachSent), note: "Assigned to this DOE", noteTone: "blue" },
      { label: "Responses", value: fmtNum(data?.top.responses), note: "Any reply", noteTone: "green" },
      { label: "Calls Booked", value: fmtNum(data?.top.callsBooked), note: "Zoom follow-ups", noteTone: "amber" },
      { label: "Response Rate", value: fmtPct(data?.top.responseRate), note: "Responses / Outreach", noteTone: "violet" }
    ],
    [data]
  );

  return (
    <div className="space-y-5">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          Outreach / DOE (Deal Originator Executive)
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
          Outreach / DOE
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          The most important DOE productivity module — how each rep's cold outreach is actually converting, measured
          against target.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </section>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={GridIcon}
          iconClass="text-[#3046b2]"
          subtitle={isAdmin ? "Pick a DOE to see their own numbers, or leave it on All DOEs for the combined total." : "Showing your own numbers only."}
          action={activeCount ? <ActionButton label="Reset" small onClick={reset} /> : undefined}
        >
          Filters
        </SectionTitle>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">DOE</label>
            {isAdmin ? (
              <select className={inputClass} value={filters.doe} onChange={(e) => set("doe")(e.target.value)}>
                <option value="">All DOEs</option>
                {(facets?.does ?? []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <div className={`${inputClass} bg-[#f7f9fc] text-[#5f6f89]`}>{user?.name ?? "—"}</div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Geography</label>
            <select className={inputClass} value={filters.geography} onChange={(e) => set("geography")(e.target.value)}>
              <option value="">All</option>
              {(facets?.geographies ?? []).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Lead Source</label>
            <select className={inputClass} value={filters.leadSource} onChange={(e) => set("leadSource")(e.target.value)}>
              <option value="">All</option>
              {(facets?.leadSources ?? []).map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date from</label>
            <input type="date" className={inputClass} value={filters.dateFrom} onChange={(e) => set("dateFrom")(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date to</label>
            <input type="date" className={inputClass} value={filters.dateTo} onChange={(e) => set("dateTo")(e.target.value)} />
          </div>
        </div>

        {/* Industry lives on the CRM Lead a cold-outreach contact became,
            not on the EmailLead itself — matched server-side via
            EmailLead.convertedToLeadId. A contact nobody has converted yet
            has no real value for this and just won't match, rather than
            showing a fake one. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Industry</label>
            <select className={inputClass} value={filters.industry} onChange={(e) => set("industry")(e.target.value)}>
              <option value="">All</option>
              {(facets?.industries ?? []).map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[#9aa6bd]">
          Industry matches against the CRM lead a cold-outreach contact was converted into — a contact nobody has
          converted yet won't match it.
        </p>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={CheckCircleIcon}
          iconClass="text-[#3046b2]"
          subtitle={filters.doe ? `Showing ${filters.doe} against target.` : "Showing the combined total across every DOE, against target."}
        >
          DOE Scorecard
        </SectionTitle>

        {error ? <p className="mt-4 text-[13px] font-medium text-[#e0483f]">{error}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">KPI</th>
                <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">Performance</th>
              </tr>
            </thead>
            <tbody>
              {scorecardRows.map((row) => (
                <tr key={row.key} className="border-b border-[#f1f4f9] last:border-0">
                  <td className="py-3 pr-4 text-[14px] font-semibold text-[#102246]">{row.label}</td>
                  <td className="py-3 pr-4 text-[15px] font-semibold text-[#334463]">
                    {row.format ? row.format() : has(row.actual) ? `${row.actual}${row.unit}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={RadarIcon}
          iconClass="text-[#3046b2]"
          subtitle="Every DOE Scorecard KPI, side by side per rep — three columns are attributable per person, the rest are company-wide since they aren't linked to a DOE yet."
        >
          DOE Performance Compression
        </SectionTitle>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[2200px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                {[
                  "DOE",
                  "Outreach/Day",
                  "Positive Response %",
                  "Cold Email Open Rate",
                  "WhatsApp Reply Rate",
                  "Zoom Call Booked",
                  ...pipelineColumns.map((c) => c.label)
                ].map((label) => (
                  <th key={label} className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.scorecard ?? []).map((row) => (
                <tr key={row.doe} className="border-b border-[#f1f4f9] last:border-0">
                  <td className="py-3 pr-4 text-[14px] font-semibold text-[#102246]">{row.doe}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{fmtNum(row.outreachPerDay)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{fmtPct(row.positiveResponseRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{fmtPct(row.coldEmailOpenRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#9aa6bd]">{fmtPct(data.companyWide.whatsappReplyRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#9aa6bd]">
                    {has(data.companyWide.zoomCallsPerDay) ? `${data.companyWide.zoomCallsPerDay}/day` : "—"}
                  </td>
                  {pipelineColumns.map((c) => (
                    <td key={c.key} className="py-3 pr-4 text-[13px] text-[#9aa6bd]">
                      {c.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && data && data.scorecard.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No outreach recorded for any DOE yet.
            </p>
          ) : null}

          {!loading && data && data.scorecard.length > 0 ? (
            <p className="mt-3 text-[12px] text-[#9aa6bd]">
              WhatsApp Reply Rate, Zoom Call Booked and every pipeline-stage column repeat the same number in every
              row — none of those records (Agent, Meeting, NDA, Data Room, IOI, Field Visit, Term Sheet) are linked
              to a single DOE, so there's no real per-rep split for them yet.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
