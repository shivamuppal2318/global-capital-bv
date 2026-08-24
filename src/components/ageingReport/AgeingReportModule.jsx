import { useEffect, useState } from "react";
import { ageingReportApi } from "../../lib/ageingReportApi";
import { Card, SectionTitle, Badge } from "../ui";
import { ClockIcon } from "../Icons";

const statusTone = { green: "green", amber: "amber", red: "red" };
const statusLabel = { green: "Green", amber: "Amber", red: "Red" };

// SLA-based ageing across the deal pipeline — Outreach is aged from an
// EmailLead still awaiting a reply; NDA/Data Room/IOI/Term Sheet are aged
// from their DealStageRecord for whichever deals are still open in that
// stage (a completed or declined record has stopped ageing). See
// server/src/lib/ageingReport.js for the exact thresholds and query.
export function AgeingReportModule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    ageingReportApi
      .get()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#ffe9d0] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#c47f1a]">
          <ClockIcon className="size-4" />
          Relationships
        </span>
        <h1 className="mt-4 text-[2.6rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Ageing Report</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[#4f6181]">
          How long deals have sat, still open, in each phase — a deal automatically turns Red once it exceeds that phase's SLA.
        </p>
      </section>

      {error ? (
        <Card className="px-5 py-6 text-[14px] text-[#e0483f]">{error}</Card>
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-[14px] text-[#8592ab]">Loading…</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {data.phases.map((phase) => (
              <Card key={phase.id} className="px-5 py-5">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5f6f89]">{phase.label}</p>
                <p className="mt-2 text-[2rem] font-semibold leading-none text-[#102246]">{phase.total}</p>
                <p className="mt-1 text-[12px] text-[#8592ab]">deal{phase.total === 1 ? "" : "s"} still open</p>

                <div className="mt-4 flex overflow-hidden rounded-full">
                  {["green", "amber", "red"].map((tone) =>
                    phase.total > 0 && phase[tone] > 0 ? (
                      <div
                        key={tone}
                        className={tone === "green" ? "bg-[#2b9b60]" : tone === "amber" ? "bg-[#f29b3a]" : "bg-[#e0483f]"}
                        style={{ width: `${(phase[tone] / phase.total) * 100}%`, height: "8px" }}
                      />
                    ) : null
                  )}
                  {phase.total === 0 ? <div className="h-2 w-full bg-[#edf1f6]" /> : null}
                </div>

                <div className="mt-3 space-y-1 text-[12px] text-[#8592ab]">
                  <p>
                    <span className="font-semibold text-[#2b9b60]">{phase.green}</span> green (0–{phase.thresholds.green}d) ·{" "}
                    <span className="font-semibold text-[#c07c1f]">{phase.amber}</span> amber ({phase.thresholds.green + 1}–
                    {phase.thresholds.amber}d) · <span className="font-semibold text-[#c94b6b]">{phase.red}</span> red (
                    {phase.thresholds.amber + 1}d+)
                  </p>
                </div>
              </Card>
            ))}
          </div>

          <Card className="px-5 py-5">
            <SectionTitle
              icon={ClockIcon}
              iconClass="text-[#e0483f]"
              subtitle="Every open deal past its phase's SLA — oldest first."
            >
              Overdue deals
            </SectionTitle>

            {data.overdueDeals.length === 0 ? (
              <p className="mt-5 text-[14px] text-[#9aa6ba]">Nothing overdue right now — every open deal is within its phase's SLA.</p>
            ) : (
              <div className="mt-5 space-y-2">
                {data.overdueDeals.map((deal, index) => (
                  <div
                    key={`${deal.name}-${deal.phase}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#ffe3e3] bg-[#fff8f8] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#102246]">
                        {deal.name} <span className="font-normal text-[#8592ab]">— {deal.company}</span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#8592ab]">{deal.phase}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone.red}>{statusLabel.red}</Badge>
                      <span className="text-[13px] font-semibold text-[#c94b6b]">{deal.days} days</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
