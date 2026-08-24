import { useEffect, useState } from "react";
import { doePerformanceApi } from "../../lib/doePerformanceApi";
import { Card, SectionTitle, StatCard } from "../ui";
import { ChartBarIcon, UsersIcon } from "../Icons";

function fmtPct(v) {
  return v == null ? "—" : `${v}%`;
}

function fmtHours(v) {
  return v == null ? "—" : `${v}h`;
}

// Per-DOE (Deal Originator Executive) scorecard — every number is a real
// aggregate over EmailActivityLog, Meeting and DealStageRecord (see
// server/src/lib/doePerformance.js), matched by owner name across those
// three tables since there's no single linked "assigned to" identity yet.
export function DoePerformanceModule() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    doePerformanceApi
      .list()
      .then((result) => setRows(result.rows))
      .catch((err) => setError(err.message));
  }, []);

  const totals = rows
    ? {
        totalOutreach: rows.reduce((sum, r) => sum + r.totalOutreach, 0),
        responses: rows.reduce((sum, r) => sum + r.responses, 0),
        zoomCalls: rows.reduce((sum, r) => sum + r.zoomCalls, 0),
        ndaSigned: rows.reduce((sum, r) => sum + r.ndaSigned, 0)
      }
    : null;

  return (
    <div className="space-y-6">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef1ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          <ChartBarIcon className="size-4" />
          Relationships
        </span>
        <h1 className="mt-4 text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">DOE Performance</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[#4f6181]">
          Personal activity scorecard for every Deal Originator Executive — total outreach, responses, Zoom calls, NDAs signed
          and deals progressed, aggregated by owner name across the outreach, meetings and deal-stage tables.
        </p>

        {totals ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard card={{ label: "Total outreach", value: String(totals.totalOutreach), note: "All DOEs", noteTone: "blue" }} />
            <StatCard card={{ label: "Responses", value: String(totals.responses), note: "All DOEs", noteTone: "violet" }} />
            <StatCard card={{ label: "Zoom calls", value: String(totals.zoomCalls), note: "All DOEs", noteTone: "cyan" }} />
            <StatCard card={{ label: "NDAs signed", value: String(totals.ndaSigned), note: "All DOEs", noteTone: "green" }} />
          </div>
        ) : null}
      </section>

      <Card className="px-5 py-5">
        <SectionTitle icon={UsersIcon} iconClass="text-[#3046b2]" subtitle="Sorted by total outreach — the DOE with the most activity first.">
          Per-DOE scorecard
        </SectionTitle>

        {error ? (
          <p className="mt-5 text-[14px] text-[#e0483f]">{error}</p>
        ) : !rows ? (
          <p className="mt-5 text-[14px] text-[#8592ab]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-5 text-[14px] text-[#9aa6ba]">
            No DOE names found yet — set an "owner" on a lead, a deal-stage record, or a MailX lead to start tracking them here.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.1em] text-[#60708b]">
                  <th className="pb-3 font-medium">DOE</th>
                  <th className="pb-3 text-right font-medium">Total outreach</th>
                  <th className="pb-3 text-right font-medium">Responses</th>
                  <th className="pb-3 text-right font-medium">Response rate</th>
                  <th className="pb-3 text-right font-medium">Outreach quality</th>
                  <th className="pb-3 text-right font-medium">Avg follow-up</th>
                  <th className="pb-3 text-right font-medium">Zoom calls</th>
                  <th className="pb-3 text-right font-medium">NDAs signed</th>
                  <th className="pb-3 text-right font-medium">Deals progressed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.doe} className="border-t border-[#e7edf5]">
                    <td className="py-3 text-[14px] font-semibold text-[#102246]">{r.doe}</td>
                    <td className="py-3 text-right text-[14px] text-[#102246]">{r.totalOutreach}</td>
                    <td className="py-3 text-right text-[14px] text-[#102246]">{r.responses}</td>
                    <td className="py-3 text-right text-[14px] font-semibold text-[#3046b2]">{fmtPct(r.responseRate)}</td>
                    <td className="py-3 text-right text-[14px] text-[#2b9b60]">{fmtPct(r.outreachQuality)}</td>
                    <td className="py-3 text-right text-[14px] text-[#5f6f89]">{fmtHours(r.avgFollowUpHours)}</td>
                    <td className="py-3 text-right text-[14px] text-[#5f6f89]">{r.zoomCalls}</td>
                    <td className="py-3 text-right text-[14px] text-[#5f6f89]">{r.ndaSigned}</td>
                    <td className="py-3 text-right text-[14px] font-semibold text-[#102246]">{r.dealsProgressed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
