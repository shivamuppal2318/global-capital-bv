import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircleIcon, FunnelIcon, GridIcon, RadarIcon } from "../Icons";
import { ActionButton, Card, SectionTitle, StatCard } from "../ui";
import { outreachDoeApi } from "../../lib/outreachDoeApi";

const inputClass =
  "w-full rounded-[10px] border border-[#d6deea] bg-white px-3 py-2 text-[13px] text-[#102246] outline-none focus:border-[#3046b2]";

const EMPTY_FILTERS = { doe: "", geography: "", dateFrom: "", dateTo: "", industry: "", ticketSizeBand: "", temperature: "" };
const has = (v) => v !== null && v !== undefined;
const fmtPct = (v) => (has(v) ? `${v}%` : "-");
const fmtNum = (v) => (has(v) ? String(v) : "-");
const fmtDays = (v) => (has(v) ? `${v} days` : "-");

function fmtMoney(value) {
  if (!has(value) || value === 0) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toLocaleString()}`;
}

export function PartnerOutreachView() {
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

  const scoped = useMemo(() => {
    if (!data) return null;
    if (filters.doe) return data.scorecard.find((r) => r.doe === filters.doe) ?? data.overall;
    return data.overall;
  }, [data, filters.doe]);

  const scorecardRows = useMemo(() => {
    if (!data || !scoped) return [];
    const k = data.pipelineKpis;
    return [
      { key: "outreachPerDay", label: "Outreach/Day", value: fmtNum(scoped.outreachPerDay) },
      { key: "positiveResponseRate", label: "Positive Response %", value: fmtPct(scoped.positiveResponseRate) },
      { key: "coldEmailOpenRate", label: "Cold Email Open Rate", value: fmtPct(scoped.coldEmailOpenRate) },
      { key: "zoomCallsPerDay", label: "Zoom Call Booked", value: has(data.companyWide.zoomCallsPerDay) ? `${data.companyWide.zoomCallsPerDay}/day` : "-" },
      { key: "responseRate", label: "Response Rate", value: fmtPct(k?.responseRate) },
      { key: "ndaConversion", label: "NDA Conversion", value: fmtPct(k?.ndaConversion) },
      { key: "zoomConversion", label: "Zoom Call 1", value: fmtPct(k?.zoomConversion) },
      { key: "dataRoomCompletion", label: "Data Room", value: fmtPct(k?.dataRoomCompletion) },
      { key: "ioiConversion", label: "IOI Signed", value: fmtPct(k?.ioiConversion) },
      { key: "zoomCall2Conversion", label: "Zoom Call 2", value: fmtPct(k?.zoomCall2Conversion) },
      { key: "fieldVisitCompletion", label: "Field Visit", value: fmtPct(k?.fieldVisitCompletion) },
      { key: "termSheetConversion", label: "Term Sheet Closed", value: fmtPct(k?.termSheetConversion) },
      { key: "pipelineValue", label: "Pipeline Value", value: fmtMoney(k?.pipelineValue) },
      { key: "avgDealAge", label: "Average Deal Age", value: fmtDays(k?.avgDealAge) }
    ];
  }, [data, scoped]);

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
      { key: "termSheetConversion", label: "Term Sheet Closed", value: fmtPct(k?.termSheetConversion) },
      { key: "pipelineValue", label: "Pipeline Value", value: fmtMoney(k?.pipelineValue) },
      { key: "avgDealAge", label: "Average Deal Age", value: fmtDays(k?.avgDealAge) }
    ];
  }, [data]);

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
      <Card className="px-5 py-5">
        <SectionTitle icon={FunnelIcon} iconClass="text-[#5769d4]" subtitle="Cold-outreach performance for your own referred leads.">
          Outreach / DOE
        </SectionTitle>

        {loading ? (
          <p className="mt-5 text-[14px] text-[#8592ab]">Loading...</p>
        ) : error ? (
          <p className="mt-5 text-[14px] text-[#e0483f]">{error}</p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <StatCard key={card.label} card={card} />
            ))}
          </div>
        )}
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle
          icon={GridIcon}
          iconClass="text-[#3046b2]"
          subtitle="Filter your outreach view by owner, geography, dates and CRM lead attributes."
          action={activeCount ? <ActionButton label="Reset" small onClick={() => setFilters(EMPTY_FILTERS)} /> : undefined}
        >
          Filters
        </SectionTitle>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="DOE" value={filters.doe} onChange={set("doe")} options={(facets?.does ?? []).map((d) => ({ value: d, label: d }))} emptyLabel="All DOEs" />
          <FilterSelect label="Geography" value={filters.geography} onChange={set("geography")} options={(facets?.geographies ?? []).map((g) => ({ value: g, label: g }))} />
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date from</label>
            <input type="date" className={inputClass} value={filters.dateFrom} onChange={(e) => set("dateFrom")(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">Date to</label>
            <input type="date" className={inputClass} value={filters.dateTo} onChange={(e) => set("dateTo")(e.target.value)} />
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FilterSelect label="Industry" value={filters.industry} onChange={set("industry")} options={(facets?.industries ?? []).map((i) => ({ value: i, label: i }))} />
          <FilterSelect label="Ticket Size" value={filters.ticketSizeBand} onChange={set("ticketSizeBand")} options={facets?.ticketSizeBands ?? []} />
          <FilterSelect
            label="Hot/Warm/Cold"
            value={filters.temperature}
            onChange={set("temperature")}
            options={(facets?.temperatures ?? []).map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() }))}
          />
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={CheckCircleIcon} iconClass="text-[#3046b2]" subtitle="Same KPI set as the staff Outreach / DOE dashboard, scoped to your account.">
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
                  <td className="py-3 pr-4 text-[15px] font-semibold text-[#334463]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={RadarIcon} iconClass="text-[#3046b2]" subtitle="Per-owner outreach numbers plus your account's pipeline conversion metrics.">
          DOE Performance Compression
        </SectionTitle>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                {["DOE", "Outreach/Day", "Positive Response %", "Cold Email Open Rate", "Zoom Call Booked", ...pipelineColumns.map((c) => c.label)].map((label) => (
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
                  <td className="py-3 pr-4 text-[13px] text-[#334463]">
                    {has(data.companyWide.zoomCallsPerDay) ? `${data.companyWide.zoomCallsPerDay}/day` : "-"}
                  </td>
                  {pipelineColumns.map((c) => (
                    <td key={c.key} className="py-3 pr-4 text-[13px] text-[#334463]">
                      {c.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && data && data.scorecard.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
              No outreach recorded yet.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, emptyLabel = "All" }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d7c96]">{label}</label>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
