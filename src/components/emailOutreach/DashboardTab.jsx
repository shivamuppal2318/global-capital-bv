import { ActionButton } from "../ui.jsx";
import { MailIcon, TagIcon, UsersIcon, InboxIcon } from "../Icons.jsx";

function MetricCard({ label, value, icon: Icon, iconClass }) {
  return (
    <div className="rounded-[18px] border border-[#d6deea] bg-white px-5 py-3.5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[1.9rem] font-semibold leading-none tracking-[-0.04em] text-[#102246]">{value}</p>
          <p className="mt-1.5 text-[14px] text-[#5f6f89]">{label}</p>
        </div>
        <Icon className={`size-6 shrink-0 ${iconClass}`} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, toneClass }) {
  return (
    <div className="rounded-[20px] border border-[#d6deea] bg-white px-6 py-4 text-center shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <p className={`text-[2rem] font-semibold leading-none tracking-[-0.04em] ${toneClass}`}>{value}</p>
      <p className="mt-1.5 text-[14px] text-[#5f6f89]">{label}</p>
    </div>
  );
}

function pctToNumber(value) {
  const parsed = Number.parseInt(String(value ?? "").replace("%", ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function DashboardTab({ mailing, onNavigateTab }) {
  const { campaigns, systemStatus, repliedLeads } = mailing;

  const totalCampaigns = campaigns.length;
  const totalLists = campaigns.length;
  const totalSubscribers = campaigns.reduce((sum, campaign) => sum + (campaign.leadCount ?? (Number.parseInt(campaign.sent, 10) || 0)), 0);
  const unreadMail = repliedLeads.filter((lead) => !lead.movedToWorkflow).length;
  const emailsSent = campaigns.reduce((sum, campaign) => sum + (campaign.sentCount ?? (Number.parseInt(campaign.sent, 10) || 0)), 0);
  const opened = campaigns.length ? Math.round(campaigns.reduce((sum, campaign) => sum + pctToNumber(campaign.open), 0) / campaigns.length) : 0;
  const clicked = campaigns.length ? Math.round(campaigns.reduce((sum, campaign) => sum + pctToNumber(campaign.click), 0) / campaigns.length) : 0;
  const topCampaigns = [...campaigns].slice(0, 5);

  return (
    <section className="space-y-3">
      {systemStatus && (!systemStatus.queueEnabled || systemStatus.emailProvider === "dev") ? (
        <div className="rounded-[12px] border border-[#ffe0bb] bg-[#fff8ef] px-4 py-2 text-[12px] leading-5 text-[#9b6b2f]">
          <span className="font-semibold">Sending isn't fully live yet:</span>{" "}
          {systemStatus.emailProvider === "dev" ? "emails are only being logged, not actually delivered" : null}
          {systemStatus.emailProvider === "dev" && !systemStatus.queueEnabled ? ", and " : null}
          {!systemStatus.queueEnabled ? "automatic follow-ups aren't scheduled (the sending queue isn't running)" : null}
          {" "}— leads you add are still saved for real, they just won't get an intro/follow-up email until this is configured.
        </div>
      ) : null}

      <div className="rounded-[26px] border border-[#d6deea] bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fc_100%)] px-5 py-5 shadow-[0_8px_28px_rgba(30,48,87,0.08)]">
        <div className="grid gap-3 lg:grid-cols-4">
          <MetricCard label="Total Campaigns" value={totalCampaigns} icon={MailIcon} iconClass="text-[#2995db]" />
          <MetricCard label="Lists" value={totalLists} icon={TagIcon} iconClass="text-[#2b9b60]" />
          <MetricCard label="Subscribers" value={totalSubscribers} icon={UsersIcon} iconClass="text-[#f29c38]" />
          <MetricCard label="Unread Mail" value={unreadMail} icon={InboxIcon} iconClass="text-[#e0483f]" />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <SummaryCard label="Emails Sent" value={emailsSent} toneClass="text-[#2995db]" />
          <SummaryCard label="Opened" value={opened} toneClass="text-[#2b9b60]" />
          <SummaryCard label="Clicked" value={clicked} toneClass="text-[#f29c38]" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.72fr_0.68fr]">
          <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <h2 className="text-[18px] font-semibold text-[#102246]">Recent Campaigns</h2>
            <div className="mt-3 overflow-x-auto rounded-[16px] border border-[#e7edf5] bg-[#f8faff]">
              <table className="w-full min-w-[620px] text-left">
                <thead>
                  <tr className="bg-[#f0f3ff] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8fe8]">
                    <th className="px-4 py-3">Campaign Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {topCampaigns.length ? (
                    topCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="border-t border-[#e7edf5] bg-white text-[13px] text-[#5d6286]">
                        <td className="px-4 py-3 font-medium text-[#5a67d8]">{campaign.name}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-[#efe9ff] px-2.5 py-1 text-[11px] font-semibold text-[#8b74c9]">
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{campaign.leadCount ?? campaign.sentCount ?? campaign.sent}</td>
                        <td className="px-4 py-3">{campaign.open}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-4 py-5 text-[14px] text-[#7a7d9c]">
                        No campaigns yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
            <h2 className="text-[18px] font-semibold text-[#102246]">Quick Actions</h2>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => onNavigateTab?.("campaigns")}
                className="w-full rounded-[10px] bg-[#18b6d3] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(24,182,211,0.22)]"
              >
                New Campaign
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("leads")}
                className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
              >
                New List
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("templates")}
                className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
              >
                New Template
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab?.("mailbox")}
                className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
              >
                Mailbox
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
