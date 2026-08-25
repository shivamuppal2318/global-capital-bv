import { useEffect, useState } from "react";
import { GridIcon, MailIcon, UsersIcon, InboxIcon, WorkflowIcon, TagIcon, CogIcon } from "../Icons.jsx";
import { noteToneClass, StatCard } from "../ui.jsx";
import { useEmailOutreachState } from "./useEmailOutreachState.js";
import { DashboardTab } from "./DashboardTab.jsx";
import { CampaignsTab } from "./CampaignsTab.jsx";
import { LeadsTab } from "./LeadsTab.jsx";
import { RepliesTab } from "./RepliesTab.jsx";
import { AutomationTab } from "./AutomationTab.jsx";
import { SettingsTab } from "./SettingsTab.jsx";
import { EmailTemplatesCadencesModule } from "../emailTemplates/EmailTemplatesCadencesModule.jsx";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: GridIcon },
  { id: "campaigns", label: "Campaigns", icon: MailIcon },
  { id: "leads", label: "Leads", icon: UsersIcon },
  { id: "replies", label: "Replies", icon: InboxIcon },
  { id: "automation", label: "Automation", icon: WorkflowIcon },
  { id: "templates", label: "Templates", icon: TagIcon },
  { id: "settings", label: "Settings", icon: CogIcon }
];

const tabContent = {
  dashboard: DashboardTab,
  campaigns: CampaignsTab,
  leads: LeadsTab,
  replies: RepliesTab,
  automation: AutomationTab,
  // Self-contained (fetches its own templates via emailTemplatesApi) — takes
  // no props, so the `mailing` prop every other tab needs is simply unused
  // here rather than requiring a separate render path.
  templates: EmailTemplatesCadencesModule,
  settings: SettingsTab
};

// Cold email outreach, split the same way WhatsApp Business is: one tab per
// concern (which campaigns exist, what happens once a lead replies, the
// sequence config, mailbox setup) instead of all four crammed onto one
// screen. All tabs share one state hook (useEmailOutreachState) so
// switching tabs never desyncs which campaign/lead is selected.
export function EmailOutreachModule({ initialTab = "dashboard" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const mailing = useEmailOutreachState();

  // The sidebar's "Cold Bulk Mailing" and "Leads" entries both render this
  // same component at the same position in App.jsx's tree (just with a
  // different initialTab) — React reuses the existing instance rather than
  // remounting it, so useState's initial value alone would only apply once
  // and silently ignore every later switch between the two entry points.
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const ActiveContent = tabContent[activeTab] ?? DashboardTab;

  // Same idea as WhatsApp Business's own module header stats (StatCard,
  // ui.jsx) — kept visible across every tab, not just Dashboard, so "how's
  // MailX doing overall" never requires switching tabs to check. Real
  // numbers from the same `mailing` state every tab already shares.
  const totalLeads = mailing.campaigns.reduce((sum, c) => sum + (c.leadCount ?? 0), 0);
  const activeMailboxes = mailing.emailAccounts.filter((a) => a.isActive).length;
  const replyRate = totalLeads > 0 ? Math.round((mailing.repliedLeads.length / totalLeads) * 100) : 0;
  const moduleStats = [
    { label: "TOTAL CAMPAIGNS", value: mailing.campaigns.length, note: `${mailing.campaigns.filter((c) => c.status === "Sending").length} sending`, noteTone: "blue" },
    { label: "TOTAL LEADS", value: totalLeads, note: "Live from Postgres", noteTone: "cyan" },
    { label: "CONNECTED MAILBOXES", value: activeMailboxes, note: `${mailing.emailAccounts.length} total`, noteTone: "amber" },
    { label: "REPLIED LEADS", value: mailing.repliedLeads.length, note: `${replyRate}% reply rate`, noteTone: "pink" }
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#def4e6] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#179150]">
            <span className="size-2 rounded-full bg-[#2b9b60]" />
            Module · Cold Email Outreach
          </span>
          <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">MailX</h1>
          <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
            Cold email outreach across connected mailboxes — campaigns, leads, reply-driven follow-ups, automation and templates in one workspace.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {moduleStats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-[18px] border border-[#d6deea] bg-white p-2 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const badgeCount = tab.id === "replies" ? mailing.repliedLeads.length : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[14px] font-medium transition ${
                active ? "bg-[#3046b2] text-white shadow-sm" : "text-[#4f6181] hover:bg-[#f4f7fb]"
              }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
              {badgeCount ? (
                <span
                  className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold ${
                    active ? "bg-white/25 text-white" : noteToneClass.green
                  }`}
                >
                  {badgeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <ActiveContent mailing={mailing} onNavigateTab={setActiveTab} />
    </div>
  );
}
