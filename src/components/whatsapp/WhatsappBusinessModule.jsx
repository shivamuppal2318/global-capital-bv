import { useState } from "react";
import {
  ChartBarIcon,
  ChatBubbleIcon,
  CogIcon,
  DropletIcon,
  LinkIcon,
  MegaphoneIcon,
  NoteIcon,
  SlidersIcon,
  WorkflowIcon,
  ZapIcon
} from "../Icons";
import { noteToneClass, StatCard } from "../ui";
import { whatsappOverview, whatsappTabs } from "../../data/whatsappData";
import { DashboardTab } from "./DashboardTab";
import { ChatTab } from "./ChatTab";
import { TemplatesTab } from "./TemplatesTab";
import { CampaignsTab } from "./CampaignsTab";
import { DripCampaignsTab } from "./DripCampaignsTab";
import { AutoRepliesTab } from "./AutoRepliesTab";
import { BotFlowsTab } from "./BotFlowsTab";
import { CrmTriggersTab } from "./CrmTriggersTab";
import { AutomationTab } from "./AutomationTab";
import { SettingsTab } from "./SettingsTab";

const tabIconMap = {
  chart: ChartBarIcon,
  chat: ChatBubbleIcon,
  note: NoteIcon,
  megaphone: MegaphoneIcon,
  droplet: DropletIcon,
  zap: ZapIcon,
  workflow: WorkflowIcon,
  link: LinkIcon,
  sliders: SlidersIcon,
  cog: CogIcon
};

const tabContent = {
  dashboard: DashboardTab,
  chat: ChatTab,
  templates: TemplatesTab,
  campaigns: CampaignsTab,
  drip: DripCampaignsTab,
  "auto-replies": AutoRepliesTab,
  "bot-flows": BotFlowsTab,
  "crm-triggers": CrmTriggersTab,
  automation: AutomationTab,
  settings: SettingsTab
};

export function WhatsappBusinessModule() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const ActiveContent = tabContent[activeTab] ?? DashboardTab;

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#def4e6] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#179150]">
              <span className="size-2 rounded-full bg-[#2b9b60]" />
              {whatsappOverview.badge}
            </span>
            <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
              {whatsappOverview.title}
            </h1>
            <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">{whatsappOverview.description}</p>
          </div>
        </div>

        <div className="mt-7 grid gap-4 xl:grid-cols-4">
          {whatsappOverview.stats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-[18px] border border-[#d6deea] bg-white p-2 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        {whatsappTabs.map((tab) => {
          const Icon = tabIconMap[tab.icon];
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-[12px] px-3.5 py-2.5 text-[14px] font-medium transition ${
                active ? "bg-[#3046b2] text-white shadow-sm" : "text-[#4f6181] hover:bg-[#f4f7fb]"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
              {tab.badge ? (
                <span
                  className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold ${
                    active ? "bg-white/25 text-white" : noteToneClass.green
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <ActiveContent />
    </div>
  );
}
