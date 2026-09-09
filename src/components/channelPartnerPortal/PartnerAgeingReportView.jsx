import { useEffect, useState } from "react";
import { RadarIcon } from "../Icons";
import { Badge, Card, SectionTitle } from "../ui";
import { ageingReportApi } from "../../lib/ageingReportApi";

// A Channel Partner's read-only view of the Ageing Report, scoped to their
// own referred leads (see server/src/lib/ageingReport.js's channelPartner
// param) -- same green/amber/red SLA framing the staff screen uses, minus
// the "by owner" breakdown (an internal staff-workload view, not something
// a partner needs).
const STATUS_TONE = { green: "green", amber: "amber", red: "red" };

export function PartnerAgeingReportView() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    ageingReportApi
      .get()
      .then(setReport)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="px-5 py-5">
      <SectionTitle icon={RadarIcon} iconClass="text-[#2f96da]" subtitle="How long your own referred leads have sat in each stage.">
        Ageing Report
      </SectionTitle>

      {loading ? (
        <p className="mt-5 text-[14px] text-[#8592ab]">Loading…</p>
      ) : error ? (
        <p className="mt-5 text-[14px] text-[#e0483f]">{error}</p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.phases.map((phase) => (
            <div key={phase.id} className="rounded-[14px] border border-[#e7edf5] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold text-[#102246]">{phase.label}</p>
                <span className="text-[12px] text-[#8592ab]">{phase.total} total</span>
              </div>
              <div className="mt-2 flex gap-2">
                <Badge tone="green">{phase.green} on time</Badge>
                <Badge tone="amber">{phase.amber} slipping</Badge>
                <Badge tone="red">{phase.red} overdue</Badge>
              </div>
              {phase.deals.length ? (
                <div className="mt-3 space-y-1.5">
                  {phase.deals.slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-[#334463]">{d.name} ({d.company})</span>
                      <Badge tone={STATUS_TONE[d.status]}>{d.days}d</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
