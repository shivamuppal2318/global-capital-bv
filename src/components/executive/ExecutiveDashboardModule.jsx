import { useEffect, useState } from "react";
import { executiveDashboardApi } from "../../lib/executiveDashboardApi";
import { Card, SectionTitle, StatCard } from "../ui";
import { ChartBarIcon, GridIcon, SparklesIcon } from "../Icons";

const has = (v) => v !== null && v !== undefined;
const fmtPct = (v) => (has(v) ? `${v}%` : "—");

// Same abbreviation scheme as the IOI module's fmtMoney: at these
// magnitudes "€99,200,000" wraps and loses its shape in a KPI tile.
function fmtMoney(value) {
  if (!has(value) || value === 0) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return `€${value.toLocaleString()}`;
}

// Each row restates one number from the funnel/KPI payload as a rate, with
// the formula that produced it — so the dashboard reads as a live
// instrument, not just a glossary of terms.
const KPI_ROWS = [
  { key: "totalOutreach", label: "Total Outreach", formula: "Cold emails sent (EmailLead records)", format: (v) => (has(v) ? String(v) : "—") },
  { key: "responseRate", label: "Response Rate", formula: "Replies received / Total outreach", format: fmtPct },
  { key: "ndaConversion", label: "NDA Conversion", formula: "NDAs signed / NDAs sent", format: fmtPct },
  { key: "zoomConversion", label: "Zoom Call 1", formula: "Calls completed / Calls scheduled", format: fmtPct },
  { key: "dataRoomCompletion", label: "Data Room Completion", formula: "Required categories uploaded / Required categories", format: fmtPct },
  { key: "ioiConversion", label: "IOI Signed", formula: "IOIs signed / IOIs generated", format: fmtPct },
  { key: "zoomCall2Conversion", label: "Zoom Call 2", formula: "Leads with a 2nd call / Leads with IOI Signed", format: fmtPct },
  { key: "fieldVisitCompletion", label: "Field Visit", formula: "Visits completed / Visits planned", format: fmtPct },
  { key: "termSheetConversion", label: "Term Sheet Close", formula: "Term sheets issued / Leads reaching field visit", format: fmtPct },
  { key: "pipelineValue", label: "Pipeline Value", formula: "Sum of qualified IOI + term sheet value", format: fmtMoney },
  { key: "avgDealAge", label: "Average Deal Age", formula: "Now − lead creation date, averaged over open deals", format: (v) => (has(v) ? `${v} days` : "—") },
  { key: "winRate", label: "Win Rate", formula: "Closed won / (Closed won + Closed lost)", format: fmtPct }
];

export function ExecutiveDashboardModule() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    executiveDashboardApi
      .get()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="px-5 py-10 text-center text-[14px] text-[#5f6f89]">Loading the dashboard…</Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Header />
        <Card className="px-5 py-6 text-[14px] text-[#e0483f]">Could not load the dashboard ({error}).</Card>
      </div>
    );
  }

  const { stats, funnel, kpis } = data;
  const funnelMax = funnel.reduce((m, s) => Math.max(m, s.count), 0);

  const trend = stats.activeDeals.trendPct;
  const cards = [
    {
      label: "Active Deals",
      value: String(stats.activeDeals.count),
      note: has(trend) ? `${trend >= 0 ? "+" : ""}${trend}% vs prior 30 days` : "Total opportunities in pipeline",
      noteTone: !has(trend) ? "blue" : trend >= 0 ? "green" : "red"
    },
    {
      label: "Term Sheets",
      value: String(stats.termSheets.count),
      note: has(stats.termSheets.conversionPct) ? `${stats.termSheets.conversionPct}% overall conversion` : "Overall conversion rate",
      noteTone: "amber"
    },
    {
      label: "Avg Deal Age",
      value: has(stats.dealAge.avgDays) ? `${stats.dealAge.avgDays} Days` : "—",
      note: "Across all lifecycle phases",
      noteTone: "blue"
    },
    {
      label: "Pipeline Value",
      value: fmtMoney(stats.pipelineValue.total),
      note: stats.pipelineValue.termSheetUnparsed
        ? `Qualified IOI + Term Sheet (${stats.pipelineValue.termSheetUnparsed} unparsed excluded)`
        : "Qualified IOI + Term Sheet",
      noteTone: "green"
    }
  ];

  // The four Executive Metrics rows that aren't a "count of leads at this
  // stage" — a %, a currency total and a day count don't belong as bars
  // next to Funnel Health's lead counts (a "75" bar would read as 75 leads,
  // not a 75% rate), so they get their own strip instead.
  const funnelExtras = [
    { label: "Response Rate", value: fmtPct(kpis.responseRate), note: "Replies received / Total outreach", noteTone: "blue" },
    { label: "Pipeline Value", value: fmtMoney(kpis.pipelineValue), note: "Qualified IOI + Term Sheet", noteTone: "green" },
    { label: "Avg Deal Age", value: has(kpis.avgDealAge) ? `${kpis.avgDealAge} Days` : "—", note: "Across all lifecycle phases", noteTone: "amber" },
    { label: "Win Rate", value: fmtPct(kpis.winRate), note: "Closed won / (won + lost)", noteTone: "violet" }
  ];

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid gap-4 xl:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} card={c} />
        ))}
      </div>

      <Card className="px-5 py-5">
        <SectionTitle icon={GridIcon} iconClass="text-[#3046b2]" subtitle="One row per stage the business tracks, with how each number is worked out.">
          Executive Metrics
        </SectionTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e7edf5]">
                <th className="py-2.5 pr-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5c6b87]">Metric</th>
                <th className="py-2.5 pr-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5c6b87]">How it&apos;s calculated</th>
                <th className="py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5c6b87]">Result</th>
              </tr>
            </thead>
            <tbody>
              {KPI_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-[#f1f4f9] last:border-0">
                  <td className="py-3 pr-4 text-[14px] font-semibold text-[#102246]">{row.label}</td>
                  <td className="py-3 pr-4 text-[13px] text-[#5c6b87]">{row.formula}</td>
                  <td className="py-3 text-[15px] font-semibold text-[#21439b]">{row.format(kpis[row.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={SparklesIcon} iconClass="text-[#8b52d0]" subtitle="Distinct leads reaching each stage of the pipeline, from first contact through to a term sheet.">
          Funnel Health
        </SectionTitle>

        {funnelMax ? (
          <div className="mt-6 flex items-end gap-3 overflow-x-auto pb-1" style={{ height: 220 }}>
            {funnel.map((s) => (
              <div key={s.key} className="flex min-w-[64px] flex-1 flex-col items-center justify-end gap-2" style={{ height: "100%" }}>
                <span className="text-[13px] font-semibold text-[#102246]">{s.count}</span>
                <div
                  className="w-full rounded-t-[8px] bg-[#4c8bf5]"
                  style={{ height: `${funnelMax ? Math.max(4, (s.count / funnelMax) * 100) : 0}%` }}
                  title={has(s.conversionFromPrevious) ? `${s.conversionFromPrevious}% of ${s.label === "Lead" ? "" : "previous stage"}` : undefined}
                />
                <span className="text-center text-[11px] font-medium text-[#5c6b87]">{s.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-[14px] border border-dashed border-[#d6deea] px-4 py-6 text-center text-[14px] text-[#5c6b87]">
            The funnel fills in as leads move through outreach, NDA, Zoom Call 1, the Data Room, a signed IOI, Zoom
            Call 2, field visits and term sheets.
          </p>
        )}
      </Card>

      <Card className="px-5 py-5">
        <SectionTitle icon={ChartBarIcon} iconClass="text-[#2b9b60]" subtitle="Rate, value and speed metrics that don't fit a lead-count bar chart.">
          Rate &amp; Value Snapshot
        </SectionTitle>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {funnelExtras.map((c) => (
            <StatCard key={c.label} card={c} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <section>
      <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
        Executive Dashboard · CEO View
      </span>
      <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
        Executive Dashboard
      </h1>
      <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
        The landing dashboard that gives the health of the entire business in one screen.
      </p>
    </section>
  );
}
