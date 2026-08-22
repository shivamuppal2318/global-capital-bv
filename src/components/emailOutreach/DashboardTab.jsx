import { ActionButton, Card, SectionTitle, ProgressBar } from "../ui.jsx";
import { SendIcon, ChartBarIcon, ClockIcon, FunnelIcon, DatabaseIcon, PlusIcon } from "../Icons.jsx";

const funnelTone = ["bg-[#1b97d2]", "bg-[#8b52d0]", "bg-[#2ba84a]", "bg-[#ff9f35]"];

// One dot color per EmailActivityKind (schema.prisma) — every kind that can
// appear in dashboardSummary.recentActivity gets a deliberate tone; an
// unmapped one (there shouldn't be any) falls back to slate rather than
// crashing.
const activityToneDot = {
  BULK_INTRO_SENT: "bg-[#3046b2]",
  BRANCH_EMAIL_SENT: "bg-[#3046b2]",
  REPLY_RECEIVED: "bg-[#8b52d0]",
  EMAIL_OPENED: "bg-[#1192cb]",
  LINK_CLICKED: "bg-[#2b9b60]",
  NDA_SIGNED: "bg-[#2b9b60]",
  CALL_BOOKED: "bg-[#2b9b60]",
  CALL_COMPLETED: "bg-[#2b9b60]",
  CALL_CANCELED: "bg-[#f29b3a]",
  BOUNCED: "bg-[#e0483f]",
  SEND_BLOCKED: "bg-[#f29b3a]",
  STAGE_CHANGED: "bg-[#8592ab]",
  MANUAL_NOTE: "bg-[#8592ab]"
};

function timeAgo(dateString) {
  const minutes = Math.round((Date.now() - new Date(dateString).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Mirrors WhatsApp Business's own Dashboard tab layout/component choices
// (Card + SectionTitle + ProgressBar, the same 1.4fr/0.6fr card grid) at the
// user's request — but every panel here is real, queried data
// (dashboardSummary from GET /api/email/campaigns/dashboard-summary), not
// the static mock arrays that module's dashboard renders.
export function DashboardTab({ mailing, onNavigateTab }) {
  const { campaigns, systemStatus, dashboardSummary } = mailing;

  const maxVolume = dashboardSummary
    ? Math.max(1, ...dashboardSummary.volumeByDay.map((d) => Math.max(d.sent, d.opened)))
    : 1;
  const funnelMax = dashboardSummary ? Math.max(1, dashboardSummary.funnel[0]?.count ?? 1) : 1;

  const topCampaigns = [...campaigns].sort((a, b) => (b.openedCount ?? 0) - (a.openedCount ?? 0)).slice(0, 5);

  return (
    <section className="space-y-6">
      {systemStatus && (!systemStatus.queueEnabled || systemStatus.emailProvider === "dev") ? (
        <div className="rounded-[16px] border border-[#ffd4a7] bg-[#fff4e7] px-4 py-3 text-[13px] leading-5 text-[#8a5a1e]">
          <span className="font-semibold">Sending isn't fully live yet:</span>{" "}
          {systemStatus.emailProvider === "dev" ? "emails are only being logged, not actually delivered" : null}
          {systemStatus.emailProvider === "dev" && !systemStatus.queueEnabled ? ", and " : null}
          {!systemStatus.queueEnabled ? "automatic follow-ups aren't scheduled (the sending queue isn't running)" : null}
          {" "}— leads you add are still saved for real, they just won't get an intro/follow-up email until this is configured.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="px-5 py-5">
          <SectionTitle icon={ChartBarIcon}>Email volume (7 days)</SectionTitle>
          {dashboardSummary ? (
            <>
              <div className="mt-6 flex items-end justify-between gap-3">
                {dashboardSummary.volumeByDay.map((d, index) => (
                  <div key={`${d.day}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-40 w-full items-end justify-center gap-1">
                      <div
                        className="w-3.5 rounded-t-full bg-[#3046b2]"
                        style={{ height: `${(d.sent / maxVolume) * 100}%` }}
                        title={`Sent: ${d.sent}`}
                      />
                      <div
                        className="w-3.5 rounded-t-full bg-[#9fb4ea]"
                        style={{ height: `${(d.opened / maxVolume) * 100}%` }}
                        title={`Opened: ${d.opened}`}
                      />
                    </div>
                    <p className="text-[12px] font-medium text-[#6a7790]">{d.day}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-5 border-t border-dashed border-[#d9e2ef] pt-4 text-[13px] text-[#5f6f89]">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-[#3046b2]" /> Sent
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-[#9fb4ea]" /> Opened
                </span>
              </div>
            </>
          ) : (
            <p className="mt-6 text-[13px] text-[#9aa6ba]">Loading…</p>
          )}
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={FunnelIcon} iconClass="text-[#8b52d0]">
            Lead funnel
          </SectionTitle>
          {dashboardSummary ? (
            <div className="mt-6 space-y-5">
              {dashboardSummary.funnel.map((row, index) => (
                <div key={row.stage}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className="text-[14px] font-semibold text-[#12213a]">{row.stage}</p>
                    <p className="text-[14px] text-[#5f6f89]">{row.count}</p>
                  </div>
                  <ProgressBar width={`${Math.round((row.count / funnelMax) * 100)}%`} tone={funnelTone[index]} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-[13px] text-[#9aa6ba]">Loading…</p>
          )}
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={SendIcon}>Top performing campaigns</SectionTitle>
          {topCampaigns.length > 0 ? (
            <div className="mt-5 space-y-3">
              {topCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between gap-4 rounded-[16px] border border-[#e7edf5] px-4 py-3"
                >
                  <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#102246]">{campaign.name}</p>
                  <p className="w-20 shrink-0 text-right text-[13px] text-[#5f6f89]">{campaign.sentCount ?? 0} sent</p>
                  <p className="w-16 shrink-0 text-right text-[13px] font-semibold text-[#2b9b60]">{campaign.open}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-[13px] text-[#9aa6ba]">No campaigns yet.</p>
          )}
        </Card>

        <Card className="px-5 py-5">
          <SectionTitle icon={ClockIcon} iconClass="text-[#f29b3a]">
            Recent activity
          </SectionTitle>
          {dashboardSummary?.recentActivity.length ? (
            <div className="mt-5 space-y-4">
              {dashboardSummary.recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${activityToneDot[item.kind] ?? "bg-[#8592ab]"}`} />
                  <div className="min-w-0">
                    <p className="text-[14px] text-[#12213a]">
                      <span className="font-semibold">{item.leadName}</span> — {item.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#8592ab]">
                      {item.campaignName} · {timeAgo(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-[13px] text-[#9aa6ba]">{dashboardSummary ? "No activity yet." : "Loading…"}</p>
          )}
        </Card>

        <Card className="px-5 py-5 xl:col-span-2">
          <SectionTitle
            icon={DatabaseIcon}
            iconClass="text-[#2995db]"
            action={<ActionButton label="Add mailbox" icon={PlusIcon} small onClick={() => onNavigateTab("settings")} />}
          >
            Mailbox performance
          </SectionTitle>
          {dashboardSummary?.mailboxPerformance.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                    <th className="pb-3 font-medium">Mailbox</th>
                    <th className="pb-3 font-medium">Country</th>
                    <th className="pb-3 font-medium">Sent today</th>
                    <th className="pb-3 text-right font-medium">Daily limit</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardSummary.mailboxPerformance.map((account) => (
                    <tr key={account.id} className="border-t border-[#e7edf5]">
                      <td className="py-3 text-[14px] font-medium text-[#102246]">{account.label}</td>
                      <td className="py-3 text-[14px] text-[#5f6f89]">{account.country ?? "—"}</td>
                      <td className="py-3 text-[14px] text-[#5f6f89]">{account.sentToday}</td>
                      <td className="py-3 text-right text-[14px] font-semibold text-[#2b9b60]">{account.dailyLimit}/day</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 text-[13px] text-[#9aa6ba]">{dashboardSummary ? "No mailboxes added yet." : "Loading…"}</p>
          )}
        </Card>
      </div>
    </section>
  );
}
