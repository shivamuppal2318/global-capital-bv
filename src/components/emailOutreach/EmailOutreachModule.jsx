import { useEffect, useState } from "react";
import { MailIcon, UsersIcon, WorkflowIcon, CogIcon } from "../Icons.jsx";
import { noteToneClass, StatCard } from "../ui.jsx";
import { useEmailOutreachState } from "./useEmailOutreachState.js";
import { CampaignsTab } from "./CampaignsTab.jsx";
import { LeadsTab } from "./LeadsTab.jsx";
import { AutomationTab } from "./AutomationTab.jsx";
import { SettingsTab } from "./SettingsTab.jsx";

const tabs = [
  { id: "campaigns", label: "Campaigns", icon: MailIcon },
  { id: "leads", label: "Leads", icon: UsersIcon },
  { id: "automation", label: "Automation", icon: WorkflowIcon },
  { id: "settings", label: "Settings", icon: CogIcon }
];

const tabContent = {
  campaigns: CampaignsTab,
  leads: LeadsTab,
  automation: AutomationTab,
  settings: SettingsTab
};

// Cold email outreach, split the same way WhatsApp Business is: one tab per
// concern (which campaigns exist, what happens once a lead replies, the
// sequence config, mailbox setup) instead of all four crammed onto one
// screen. All tabs share one state hook (useEmailOutreachState) so
// switching tabs never desyncs which campaign/lead is selected.
export function EmailOutreachModule({ initialTab = "campaigns" }) {
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
  const ActiveContent = tabContent[activeTab] ?? CampaignsTab;

  const stats = [
    {
      label: "Active campaigns",
      value: String(mailing.campaigns.filter((c) => c.status === "Sending").length),
      note: `${mailing.campaigns.length} total`,
      noteTone: "blue"
    },
    {
      label: "Connected mailboxes",
      value: String(mailing.emailAccounts.filter((a) => a.isActive).length),
      note: `${mailing.emailAccounts.length} registered`,
      noteTone: "cyan"
    },
    {
      label: "Replied leads",
      value: String(mailing.repliedLeads.length),
      note: `${mailing.repliedLeads.filter((l) => l.movedToWorkflow).length} in workflow`,
      noteTone: "green"
    },
    {
      label: "Next sequence length",
      value: String(mailing.liveSteps.length),
      note: "touches per lead",
      noteTone: "violet"
    }
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="max-w-3xl">
          <h1 className="text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">Email Outreach</h1>
          <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
            Cold email campaigns, warm-up-aware sending limits, multi-step cadences, and the reply-classify-auto-respond loop that
            fires once a lead writes back.
          </p>
        </div>

        <div className="mt-7 grid gap-4 xl:grid-cols-4">
          {stats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-[18px] border border-[#d6deea] bg-white p-2 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const badgeCount = tab.id === "leads" ? mailing.repliedLeads.length : null;
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

      <ActiveContent mailing={mailing} />
    </div>
  );
}
