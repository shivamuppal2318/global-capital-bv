import { useCallback, useEffect, useMemo, useState } from "react";
import { outreachDoeApi } from "../../lib/outreachDoeApi";
import { ActionButton, Badge, Card, SectionTitle, StatCard } from "../ui";
import { CheckCircleIcon, GridIcon, RadarIcon } from "../Icons";

const inputClass =
  "w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#102246] outline-none focus:border-[#3046b2]";

const has = (v) => v !== null && v !== undefined;
const fmtPct = (v) => (has(v) ? `${v}%` : "—");
const fmtNum = (v) => (has(v) ? String(v) : "—");

const EMPTY_FILTERS = { doe: "", geography: "", dateFrom: "", dateTo: "" };

export function OutreachDoeModule() {
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
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
  const activeCount = Object.values(filters).filter(Boolean).length;

  // The scorecard row to show against target: the selected DOE's own
  // numbers, or the combined total across everyone when no DOE is picked.
  const scoped = useMemo(() => {
    if (!data) return null;
    if (filters.doe) return data.scorecard.find((r) => r.doe === filters.doe) ?? data.overall;
    return data.overall;
  }, [data, filters.doe]);

  const scorecardRows = useMemo(() => {
    if (!data || !scoped) return [];
    const t = data.targets;
    return [
      { key: "outreachPerDay", label: "Outreach/Day", actual: scoped.outreachPerDay, target: t.outreachPerDay, unit: "" , attributable: true },
      { key: "positiveResponseRate", label: "Positive Response %", actual: scoped.positiveResponseRate, target: t.positiveResponseRate, unit: "%", attributable: true },
      { key: "linkedinAcceptanceRate", label: "LinkedIn Acceptance", actual: data.companyWide.linkedinAcceptanceRate, target: t.linkedinAcceptanceRate, unit: "%", attributable: false, note: "Not tracked — no LinkedIn integration" },
      { key: "coldEmailOpenRate", label: "Cold Email Open Rate", actual: scoped.coldEmailOpenRate, target: t.coldEmailOpenRate, unit: "%", attributable: true },
      { key: "whatsappReplyRate", label: "WhatsApp Reply Rate", actual: data.companyWide.whatsappReplyRate, target: t.whatsappReplyRate, unit: "%", attributable: false, note: "Company-wide — WhatsApp agents aren't linked to a DOE yet" },
      { key: "zoomCallsPerDay", label: "Zoom Call Booked", actual: data.companyWide.zoomCallsPerDay, target: t.zoomCallsPerDay, unit: "/day", attributable: false, note: "Company-wide — meetings aren't linked to a DOE yet" }
    ];
  }, [data, scoped]);

  const cards = useMemo(
    () => [
      { label: "Outreach Sent", value: fmtNum(data?.top.outreachSent), note: "Emails sent", noteTone: "blue" },
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
          subtitle="Pick a DOE to see their own numbers, or leave it on All DOEs for the combined total."
          action={activeCount ? <ActionButton label="Reset" small onClick={() => setFilters(EMPTY_FILTERS)} /> : undefined}
        >
          Filters
        </SectionTitle>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">DOE</label>
            <select className={inputClass} value={filters.doe} onChange={(e) => set("doe")(e.target.value)}>
              <option value="">All DOEs</option>
              {(facets?.does ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date from</label>
            <input type="date" className={inputClass} value={filters.dateFrom} onChange={(e) => set("dateFrom")(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date to</label>
            <input type="date" className={inputClass} value={filters.dateTo} onChange={(e) => set("dateTo")(e.target.value)} />
          </div>
        </div>

        {/* Industry / Ticket Size / Hot-Warm-Cold are CRM Lead attributes —
            cold-outreach records aren't linked to a CRM lead, so there is
            nothing real to filter by yet. Shown, disabled, and explained
            rather than silently dropped or faked. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {["Industry", "Ticket Size", "Hot/Warm/Cold"].map((label) => (
            <div key={label}>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa6bd]">{label}</label>
              <select className={`${inputClass} cursor-not-allowed bg-[#f7f9fc] text-[#9aa6bd]`} disabled>
                <option>Not available yet</option>
              </select>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[#9aa6bd]">
          Industry, Ticket Size and Hot/Warm/Cold live on CRM leads (see Universal Filters) — cold-outreach records
          aren't linked to a CRM lead yet, so there's nothing real to filter by here.
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
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">KPI</th>
                <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">Actual</th>
                <th className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">Target</th>
                <th className="py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">Status</th>
              </tr>
            </thead>
            <tbody>
              {scorecardRows.map((row) => {
                const onTarget = has(row.actual) && row.actual >= row.target;
                return (
                  <tr key={row.key} className="border-b border-[#f1f4f9] last:border-0">
                    <td className="py-3 pr-4 text-[14px] font-semibold text-[#102246]">
                      {row.label}
                      {!row.attributable ? <span className="ml-2 text-[11px] font-normal text-[#9aa6bd]">(company-wide)</span> : null}
                    </td>
                    <td className="py-3 pr-4 text-[15px] font-semibold text-[#334463]">
                      {has(row.actual) ? `${row.actual}${row.unit}` : row.note ? "—" : "—"}
                    </td>
                    <td className="py-3 pr-4 text-[13px] text-[#5c6b87]">
                      {row.target}
                      {row.unit}
                    </td>
                    <td className="py-3">
                      {has(row.actual) ? (
                        <Badge tone={onTarget ? "green" : "amber"}>{onTarget ? "On target" : "Below target"}</Badge>
                      ) : (
                        <Badge tone="slate">{row.note ?? "No data"}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={RadarIcon}
          iconClass="text-[#3046b2]"
          subtitle="Every DOE Scorecard KPI, side by side per rep — three columns are attributable per person, three are company-wide since they aren't linked to a DOE yet."
        >
          DOE Performance Compression
        </SectionTitle>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                {[
                  { label: "DOE" },
                  { label: "Outreach/Day" },
                  { label: "Positive Response %" },
                  { label: "LinkedIn Acceptance", companyWide: true },
                  { label: "Cold Email Open Rate" },
                  { label: "WhatsApp Reply Rate", companyWide: true },
                  { label: "Zoom Call Booked", companyWide: true }
                ].map((h) => (
                  <th key={h.label} className="py-2.5 pr-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c6b87]">
                    {h.label}
                    {h.companyWide ? <span className="ml-1.5 font-normal normal-case text-[#9aa6bd]">(company-wide)</span> : null}
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
                  <td className="py-3 pr-4 text-[13px] text-[#9aa6bd]">{fmtPct(data.companyWide.linkedinAcceptanceRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">{fmtPct(row.coldEmailOpenRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#9aa6bd]">{fmtPct(data.companyWide.whatsappReplyRate)}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#9aa6bd]">
                    {has(data.companyWide.zoomCallsPerDay) ? `${data.companyWide.zoomCallsPerDay}/day` : "—"}
                  </td>
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
              LinkedIn Acceptance, WhatsApp Reply Rate and Zoom Call Booked repeat the same company-wide number in
              every row — Agent and Meeting records aren't linked to a DOE yet, so there's no real per-rep split for
              these three.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
