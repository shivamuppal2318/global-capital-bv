import { useEffect, useState } from "react";
import { GridIcon, MailIcon, UsersIcon, WorkflowIcon, TagIcon, CogIcon } from "../Icons.jsx";
import { noteToneClass } from "../ui.jsx";
import { useEmailOutreachState } from "./useEmailOutreachState.js";
import { DashboardTab } from "./DashboardTab.jsx";
import { CampaignsTab } from "./CampaignsTab.jsx";
import { LeadsTab } from "./LeadsTab.jsx";
import { AutomationTab } from "./AutomationTab.jsx";
import { SettingsTab } from "./SettingsTab.jsx";
import { MailboxTab } from "./MailboxTab.jsx";
import { SegmentsTab } from "./SegmentsTab.jsx";
import { AiAgentTab } from "./AiAgentTab.jsx";
import { EmailTemplatesCadencesModule } from "../emailTemplates/EmailTemplatesCadencesModule.jsx";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: GridIcon },
  { id: "campaigns", label: "Campaigns", icon: MailIcon },
  { id: "leads", label: "Leads", icon: UsersIcon },
  { id: "automation", label: "Automation", icon: WorkflowIcon },
  { id: "segments", label: "Segments", icon: UsersIcon },
  { id: "templates", label: "Templates", icon: TagIcon },
  { id: "mailbox", label: "Mailbox", icon: MailIcon },
  { id: "ai-agent", label: "AI Agent", icon: WorkflowIcon },
  { id: "settings", label: "Settings", icon: CogIcon }
];

const tabContent = {
  dashboard: DashboardTab,
  campaigns: CampaignsTab,
  leads: LeadsTab,
  automation: AutomationTab,
  segments: SegmentsTab,
  // Self-contained (fetches its own templates via emailTemplatesApi) — takes
  // no props, so the `mailing` prop every other tab needs is simply unused
  // here rather than requiring a separate render path.
  templates: EmailTemplatesCadencesModule,
  // Replies used to be its own tab — folded into Mailbox instead, since
  // "what came in" and "what to do about a reply" are the same concern from
  // an inbox's point of view. MailboxTab renders the former RepliesTab
  // content itself.
  mailbox: MailboxTab,
  "ai-agent": AiAgentTab,
  settings: SettingsTab
};

// Cold email outreach, split the same way WhatsApp Business is: one tab per
// concern (which campaigns exist, what happens once a lead replies, the
// sequence config, mailbox setup) instead of all four crammed onto one
// screen. All tabs share one state hook (useEmailOutreachState) so
// switching tabs never desyncs which campaign/lead is selected.
// visibleTabs optionally restricts which of the tabs above are shown/reachable
// — omitted (the staff usage in App.jsx) shows all of them, unchanged. The
// Channel Partner Portal (ChannelPartnerPortalApp.jsx) passes a short list
// (dashboard/campaigns/leads/automation) since Segments/Templates/Mailbox/AI
// Agent/Settings all talk to staff-only endpoints a partner's token can't
// reach — hiding those tabs instead of leaving them clickable-but-broken.
export function EmailOutreachModule({ initialTab = "dashboard", visibleTabs }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const mailing = useEmailOutreachState();
  const shownTabs = visibleTabs ? tabs.filter((tab) => visibleTabs.includes(tab.id)) : tabs;

  // The sidebar's "Cold Bulk Mailing" and "Leads" entries both render this
  // same component at the same position in App.jsx's tree (just with a
  // different initialTab) — React reuses the existing instance rather than
  // remounting it, so useState's initial value alone would only apply once
  // and silently ignore every later switch between the two entry points.
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  // Falls back to Dashboard for a tab hidden by visibleTabs too, not just an
  // unknown id — a DashboardTab "Quick Action" shortcut (e.g. "Mailbox")
  // calls onNavigateTab directly, bypassing the nav buttons shownTabs
  // already filters, so this is the one place that restriction has to be
  // enforced for it to actually hold.
  const ActiveContent = shownTabs.some((tab) => tab.id === activeTab) ? tabContent[activeTab] ?? DashboardTab : DashboardTab;

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1.5 rounded-[16px] border border-[#d6deea] bg-white p-1.5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        {shownTabs.map((tab) => {
          const active = tab.id === activeTab;
          const badgeCount = tab.id === "mailbox" ? mailing.repliedLeads.length : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-[11px] px-3 py-2 text-[13px] font-medium transition ${
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
