import { useState } from "react";
import { MailIcon, UsersIcon } from "../Icons.jsx";
import { noteToneClass } from "../ui.jsx";
import { useEmailOutreachState } from "./useEmailOutreachState.js";
import { CampaignsTab } from "./CampaignsTab.jsx";
import { LeadsTab } from "./LeadsTab.jsx";

const tabs = [
  { id: "campaigns", label: "Campaigns", icon: MailIcon },
  { id: "leads", label: "Leads", icon: UsersIcon }
];

// Cold email outreach: campaign setup + mailbox management (Campaigns tab)
// and what happens once a lead actually replies (Leads tab). Both tabs
// share one state hook (useEmailOutreachState) so switching tabs never
// desyncs which campaign/lead is selected.
export function EmailOutreachModule({ initialTab = "campaigns" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const mailing = useEmailOutreachState();

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

      {activeTab === "leads" ? <LeadsTab mailing={mailing} /> : <CampaignsTab mailing={mailing} />}
    </div>
  );
}
