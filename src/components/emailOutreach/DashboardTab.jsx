import { ActionButton, noteToneClass } from "../ui.jsx";
import { MegaphoneIcon, UsersIcon, MailIcon, InboxIcon, SendIcon, ChartBarIcon, TagIcon, PlusIcon, CogIcon } from "../Icons.jsx";

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

function IconStat({ icon: Icon, iconTone, label, value }) {
  return (
    <div className="flex items-center gap-4 rounded-[20px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <div className={`grid size-12 shrink-0 place-items-center rounded-[14px] ${iconTone}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-[1.7rem] font-semibold leading-none tracking-[-0.03em] text-[#0f2042]">{value}</p>
        <p className="mt-1.5 text-[13px] text-[#5c6b87]">{label}</p>
      </div>
    </div>
  );
}

function EngagementStat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-[20px] border border-[#d6deea] bg-white px-5 py-5 text-center shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <div className={`mx-auto grid size-10 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4" />
      </div>
      <p className="mt-3 text-[2.4rem] font-bold leading-none text-[#0f2042]">{value}</p>
      <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.14em] text-[#8593ac]">{label}</p>
    </div>
  );
}

// The MailX landing view — a real dashboard (aggregate stats + a recent-
// campaigns glance + one-click shortcuts to the tab you actually want),
// rather than dropping straight into the Campaigns table. All numbers are
// summed from the same `campaigns`/`emailAccounts`/`repliedLeads` data the
// other tabs already use — nothing here is fabricated for the view.
export function DashboardTab({ mailing, onNavigateTab }) {
  const { campaigns, emailAccounts, repliedLeads, systemStatus } = mailing;

  const totalLeads = campaigns.reduce((sum, c) => sum + (c.leadCount ?? 0), 0);
  const totalSent = campaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
  const totalOpened = campaigns.reduce((sum, c) => sum + (c.openedCount ?? 0), 0);
  const totalClicked = campaigns.reduce((sum, c) => sum + (c.clickedCount ?? 0), 0);
  const activeMailboxes = emailAccounts.filter((a) => a.isActive).length;

  const recentCampaigns = campaigns.slice(0, 5);

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IconStat icon={MegaphoneIcon} iconTone="bg-[#eef1ff] text-[#4766cc]" label="Total campaigns" value={campaigns.length} />
        <IconStat icon={UsersIcon} iconTone="bg-[#dff5e7] text-[#2b9b60]" label="Total leads" value={totalLeads} />
        <IconStat icon={MailIcon} iconTone="bg-[#fff4e7] text-[#f29b3a]" label="Connected mailboxes" value={activeMailboxes} />
        <IconStat icon={InboxIcon} iconTone="bg-[#ffe4ee] text-[#ef5b8f]" label="Replied leads" value={repliedLeads.length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <EngagementStat icon={SendIcon} label="Emails sent" value={totalSent} tone="bg-[#eef1ff] text-[#4766cc]" />
        <EngagementStat icon={ChartBarIcon} label="Opened" value={totalOpened} tone="bg-[#dff5e7] text-[#2b9b60]" />
        <EngagementStat icon={TagIcon} label="Clicked" value={totalClicked} tone="bg-[#fff4e7] text-[#f29b3a]" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold text-[#102246]">Recent campaigns</h2>
            <button
              type="button"
              onClick={() => onNavigateTab("campaigns")}
              className="text-[13px] font-semibold text-[#3046b2] hover:underline"
            >
              View all
            </button>
          </div>

          {recentCampaigns.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="border-b border-[#e7edf5] text-[12px] uppercase tracking-[0.08em] text-[#8593ac]">
                    <th className="pb-2 font-medium">Campaign</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Recipients</th>
                    <th className="pb-2 text-right font-medium">Opened</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3f9]">
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="py-3 font-medium text-[#102246]">{campaign.name}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${campaignToneClass[campaign.status] ?? noteToneClass.slate}`}>
                          {campaign.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-[#435471]">{campaign.leadCount ?? 0}</td>
                      <td className="py-3 text-right text-[#435471]">{campaign.openedCount ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-[#9aa6ba]">No campaigns yet.</p>
          )}
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Quick actions</h2>
          <div className="mt-4 flex flex-col gap-2.5">
            <ActionButton label="New campaign" icon={PlusIcon} primary onClick={() => onNavigateTab("campaigns")} />
            <ActionButton label="New template" icon={TagIcon} onClick={() => onNavigateTab("templates")} />
            <ActionButton label="Add mailbox" icon={CogIcon} onClick={() => onNavigateTab("settings")} />
          </div>
        </div>
      </div>
    </section>
  );
}
