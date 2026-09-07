import { useState } from "react";
import { ActionButton } from "../ui.jsx";
import { MailIcon, TagIcon, UsersIcon, InboxIcon, XIcon } from "../Icons.jsx";
import { emailCampaignsApi } from "../../lib/emailCampaignsApi.js";

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

// onClick opens the matching engagement-detail popup below — every card
// here has one now, including Emails Sent (a list of individual sends,
// since that number counts raw send events rather than distinct leads).
function SummaryCard({ label, value, toneClass, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-[20px] border border-[#d6deea] bg-white px-6 py-4 text-center shadow-[0_4px_16px_rgba(30,48,87,0.06)] ${onClick ? "cursor-pointer transition hover:border-[#b9c4d8] hover:shadow-[0_6px_20px_rgba(30,48,87,0.1)]" : ""}`}
    >
      <p className={`text-[2rem] font-semibold leading-none tracking-[-0.04em] ${toneClass}`}>{value}</p>
      <p className="mt-1.5 text-[14px] text-[#5f6f89]">{label}</p>
      {onClick ? <p className="mt-1 text-[11px] font-medium text-[#8593ac]">Click to see who</p> : null}
    </Tag>
  );
}

export function DashboardTab({ mailing, onNavigateTab, availableTabs }) {
  const { campaigns, segments, systemStatus, repliedLeads, startNewList } = mailing;
  const canOpenTab = (tab) => !availableTabs || availableTabs.includes(tab);

  const totalCampaigns = campaigns.length;
  // Real saved segments (Segments tab) — a named, reusable, filter-defined
  // group of leads. Labeled "Segments" here, not "Lists" — this session's
  // "List" work (New List/Add to List/Send To's cross-list targeting) made
  // "List" mean an EmailCampaign everywhere else in this app (already
  // counted by Total Campaigns above), so calling this stat "Lists" too
  // just reads as a wrong/duplicate number next to it.
  const totalSegments = segments.length;
  const totalSubscribers = campaigns.reduce((sum, campaign) => sum + (campaign.leadCount ?? (Number.parseInt(campaign.sent, 10) || 0)), 0);
  const unreadMail = repliedLeads.filter((lead) => !lead.movedToWorkflow).length;
  const emailsSent = campaigns.reduce((sum, campaign) => sum + (campaign.sentCount ?? (Number.parseInt(campaign.sent, 10) || 0)), 0);
  // Real cumulative counts (distinct leads who opened/clicked, summed
  // across every campaign) — not an average of each campaign's own rate
  // percentage, which is what this used to compute and display as a bare
  // number right next to Emails Sent (a real count), reading as if "0
  // opened, 7 clicked" were literal counts when it was actually "campaigns
  // average a 0% open rate and a 7% click rate."
  const opened = campaigns.reduce((sum, campaign) => sum + (campaign.openedCount ?? 0), 0);
  const clicked = campaigns.reduce((sum, campaign) => sum + (campaign.clickedCount ?? 0), 0);
  const unsubscribed = campaigns.reduce((sum, campaign) => sum + (campaign.unsubscribedCount ?? 0), 0);
  const bounced = campaigns.reduce((sum, campaign) => sum + (campaign.bouncedCount ?? 0), 0);
  const topCampaigns = [...campaigns].slice(0, 5);

  // Which lead actually makes up the Opened/Clicked/Unsubscribed number on
  // the card just clicked — fetched on demand (not preloaded for all three
  // up front, same lazy pattern CampaignsTab's own per-campaign sent-activity
  // popup uses) since most visits never open one of these.
  const [engagementDetail, setEngagementDetail] = useState(null);

  function openEngagementDetail(kind, label) {
    setEngagementDetail({ kind, label, rows: [], loading: true });
    emailCampaignsApi
      .engagementDetail(kind)
      .then((rows) => setEngagementDetail({ kind, label, rows, loading: false }))
      .catch(() => setEngagementDetail({ kind, label, rows: [], loading: false }));
  }

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
          <MetricCard label="Segments" value={totalSegments} icon={TagIcon} iconClass="text-[#2b9b60]" />
          <MetricCard label="Subscribers" value={totalSubscribers} icon={UsersIcon} iconClass="text-[#f29c38]" />
          <MetricCard label="Unread Mail" value={unreadMail} icon={InboxIcon} iconClass="text-[#e0483f]" />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          <SummaryCard label="Emails Sent" value={emailsSent} toneClass="text-[#2995db]" onClick={() => openEngagementDetail("sent", "Emails Sent")} />
          <SummaryCard label="Opened" value={opened} toneClass="text-[#2b9b60]" onClick={() => openEngagementDetail("opened", "Opened")} />
          <SummaryCard label="Clicked" value={clicked} toneClass="text-[#f29c38]" onClick={() => openEngagementDetail("clicked", "Clicked")} />
          <SummaryCard label="Bounced" value={bounced} toneClass="text-[#c47f1a]" onClick={() => openEngagementDetail("bounced", "Bounced")} />
          <SummaryCard label="Unsubscribed" value={unsubscribed} toneClass="text-[#e0483f]" onClick={() => openEngagementDetail("unsubscribed", "Unsubscribed")} />
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
                // startNewList resets the form and signals LeadsTab to open
                // straight to its "New List" form — a List is the same
                // EmailCampaign record a Campaign is, just created from the
                // Leads tab's form instead of the Campaigns tab's composer.
                onClick={() => {
                  startNewList?.();
                  onNavigateTab?.("leads");
                }}
                className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
              >
                New List
              </button>
              {canOpenTab("templates") ? (
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("templates")}
                  className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
                >
                  New Template
                </button>
              ) : null}
              {canOpenTab("mailbox") ? (
                <button
                  type="button"
                  onClick={() => onNavigateTab?.("mailbox")}
                  className="w-full rounded-[10px] border border-[#d6deea] bg-white px-4 py-2 text-[13px] font-semibold text-[#102246]"
                >
                  Mailbox
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {engagementDetail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setEngagementDetail(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-[16px] border border-[#d6deea] bg-white p-5 shadow-[0_12px_36px_rgba(16,34,70,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#102246]">{engagementDetail.label}</p>
                <p className="text-[12px] text-[#8592ab]">
                  {engagementDetail.loading
                    ? "Loading…"
                    : `${engagementDetail.rows.length} ${engagementDetail.kind === "sent" ? "send(s)" : "lead(s)"} — across every campaign`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEngagementDetail(null)}
                className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#8592ab] hover:bg-[#f0f3f9]"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            {engagementDetail.loading ? null : engagementDetail.rows.length ? (
              <div className="mt-4 space-y-2">
                {engagementDetail.rows.map((row, i) => (
                  <div key={i} className="rounded-[12px] border border-[#e7edf5] px-4 py-2.5">
                    <p className="truncate text-[13.5px] font-semibold text-[#102246]">
                      {row.leadName} <span className="font-normal text-[#8592ab]">— {row.leadEmail}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[#6a7790]">
                      {row.campaignName} · {new Date(row.at).toLocaleString()}
                    </p>
                    {row.detail ? <p className="mt-1 text-[12px] leading-4 text-[#8592ab]">{row.detail}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#9aa6ba]">No leads yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
