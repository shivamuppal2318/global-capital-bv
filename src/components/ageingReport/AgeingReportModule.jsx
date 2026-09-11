import { useEffect, useState } from "react";
import { ageingReportApi } from "../../lib/ageingReportApi";
import { Card, SectionTitle, Badge, ActionButton } from "../ui";
import { ClockIcon, MailIcon, UsersIcon } from "../Icons";

const statusTone = { green: "green", amber: "amber", red: "red" };
const statusLabel = { green: "Green", amber: "Amber", red: "Red" };
const statusDot = { green: "bg-[#2b9b60]", amber: "bg-[#f29b3a]", red: "bg-[#e0483f]" };

// Shared table shell for the three lists below (DOE follow-up pending,
// Overdue deals, Overdue by owner) — one place for the header/empty-state
// markup instead of three near-identical copies.
function ReportTable({ columns, rows, emptyText }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[14px] border border-[#e1e8f2]">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="bg-[#eef4fb] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6e7c95]">
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 ${column.className ?? ""}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7edf5] bg-white text-[13px] text-[#435471]">
          {rows.length ? (
            rows
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4 text-[#9aa6ba]">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// SLA-based ageing across the full deal pipeline (Outreach through Term
// Sheet, Zoom Calls and Field Visit included) — fully driven by
// data.phases below, nothing about which phases exist is hardcoded here.
// See server/src/lib/ageingReport.js for what each phase is actually aged
// from and the exact thresholds.
export function AgeingReportModule({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedPhase, setExpandedPhase] = useState(null);

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
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Ageing Report</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          How long deals have sat, still open, in each phase — a deal automatically turns Red once it exceeds that phase's SLA.
          Click a phase to see every deal in it, not just the overdue ones.
        </p>
      </section>

      {error ? (
        <Card className="px-5 py-6 text-[14px] text-[#e0483f]">{error}</Card>
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-[14px] text-[#8592ab]">Loading…</Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {data.phases.map((phase) => {
              const expanded = expandedPhase === phase.id;
              return (
                <Card key={phase.id} className="px-5 py-5">
                  <button
                    type="button"
                    onClick={() => setExpandedPhase(expanded ? null : phase.id)}
                    className="flex w-full items-start justify-between gap-2 text-left"
                  >
                    <div>
                      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#5f6f89]">{phase.label}</p>
                      <p className="mt-2 text-[2rem] font-semibold leading-none text-[#102246]">{phase.total}</p>
                      <p className="mt-1 text-[12px] text-[#8592ab]">deal{phase.total === 1 ? "" : "s"} still open</p>
                    </div>
                    {phase.total > 0 ? (
                      <span className="mt-1.5 shrink-0 text-[12px] text-[#9aa6ba]">{expanded ? "▴" : "▾"}</span>
                    ) : null}
                  </button>

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

                  {expanded ? (
                    <div className="mt-4 space-y-1.5 border-t border-[#e7edf5] pt-3">
                      {phase.deals.map((deal) => (
                        <div key={deal.id} className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 hover:bg-[#f8faff]">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className={`size-2 shrink-0 rounded-full ${statusDot[deal.status]}`} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#102246]">{deal.name}</p>
                              <p className="truncate text-[11px] text-[#8592ab]">
                                {deal.company}
                                {deal.owner ? ` · ${deal.owner}` : ""}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 text-[12px] font-semibold text-[#5f6f89]">{deal.days}d</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(phase.navigateTo)}
                      className="mt-3 text-[12px] font-semibold text-[#3046b2] hover:underline"
                    >
                      Open {phase.label} →
                    </button>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <Card className="px-5 py-5">
            <SectionTitle
              icon={MailIcon}
              iconClass="text-[#3046b2]"
              subtitle="Interested cold replies that have not received any next CRM action yet."
            >
              DOE follow-up pending
            </SectionTitle>

            <ReportTable
              columns={[
                { key: "lead", label: "Lead" },
                { key: "company", label: "Company" },
                { key: "doe", label: "DOE" },
                { key: "source", label: "Source" },
                { key: "age", label: "Pending" },
                { key: "action", label: "Action", className: "text-right" }
              ]}
              emptyText="No interested replies are waiting on DOE follow-up right now."
              rows={(data.staleInterested ?? []).map((lead) => (
                <tr key={lead.id} className="transition hover:bg-[#f8fbff]">
                  <td className="px-4 py-3 font-semibold text-[#102246]">{lead.name}</td>
                  <td className="px-4 py-3">{lead.company || "—"}</td>
                  <td className="px-4 py-3">{lead.owner || "Unassigned"}</td>
                  <td className="px-4 py-3">{lead.channelPartner ? `Partner: ${lead.channelPartner}` : "Cold outreach reply"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={lead.days > 2 ? "red" : "amber"}>{lead.days}d pending</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {onNavigate ? (
                      <button type="button" onClick={() => onNavigate("crm-workspace")} className="text-[12px] font-semibold text-[#3046b2] hover:underline">
                        Open CRM →
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            />
          </Card>

          <Card className="px-5 py-5">
            <SectionTitle
              icon={ClockIcon}
              iconClass="text-[#e0483f]"
              subtitle="Every open deal past its phase's SLA — oldest first."
            >
              Overdue deals
            </SectionTitle>

            <ReportTable
              columns={[
                { key: "lead", label: "Lead" },
                { key: "company", label: "Company" },
                { key: "phase", label: "Phase" },
                { key: "owner", label: "DOE" },
                { key: "age", label: "Age" },
                { key: "status", label: "Status" },
                { key: "action", label: "Action", className: "text-right" }
              ]}
              emptyText="Nothing overdue right now — every open deal is within its phase's SLA."
              rows={data.overdueDeals.map((deal, index) => (
                <tr key={`${deal.name}-${deal.phase}-${index}`} className="transition hover:bg-[#fff8f8]">
                  <td className="px-4 py-3 font-semibold text-[#102246]">{deal.name}</td>
                  <td className="px-4 py-3">{deal.company || "—"}</td>
                  <td className="px-4 py-3">{deal.phase}</td>
                  <td className="px-4 py-3">{deal.owner || "Unassigned"}</td>
                  <td className="px-4 py-3 font-semibold text-[#c94b6b]">{deal.days} days</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone.red}>{statusLabel.red}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {onNavigate ? <ActionButton label="Open" small onClick={() => onNavigate(deal.navigateTo)} /> : "—"}
                  </td>
                </tr>
              ))}
            />
          </Card>

          <Card className="px-5 py-5">
            <SectionTitle icon={UsersIcon} iconClass="text-[#8b52d0]" subtitle="Who owns the most overdue deals.">
              Overdue by owner
            </SectionTitle>
            <ReportTable
              columns={[
                { key: "owner", label: "DOE" },
                { key: "overdue", label: "Overdue", className: "text-right" }
              ]}
              emptyText="No overdue deals to attribute yet."
              rows={data.byOwner.map((row) => (
                <tr key={row.owner} className="transition hover:bg-[#f8fbff]">
                  <td className="px-4 py-3 font-semibold text-[#102246]">{row.owner}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex rounded-full bg-[#ffe3e3] px-2.5 py-1 text-[11px] font-semibold text-[#c94b6b]">
                      {row.overdueCount}
                    </span>
                  </td>
                </tr>
              ))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
