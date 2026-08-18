import { useState } from "react";
import { ChartBarIcon, ClockIcon, CogIcon, LinkIcon, SparklesIcon, UsersIcon, ZapIcon } from "../Icons";
import { Card, SectionTitle, Toggle } from "../ui";
import { settingsData } from "../../data/whatsappData";
import { ConnectionPanel } from "./settings/ConnectionPanel";
import { IntegrationsPanel } from "./settings/IntegrationsPanel";
import { PlaceholderPanel } from "./settings/PlaceholderPanel";

const SETTINGS_TABS = [
  { id: "connection", label: "Connection", icon: LinkIcon },
  { id: "ai-agent", label: "AI Agent", icon: SparklesIcon },
  { id: "intelligent-reply", label: "Intelligent Reply", icon: ZapIcon },
  { id: "conversions-api", label: "Conversions API", icon: ChartBarIcon },
  { id: "integrations", label: "Integrations & API", icon: CogIcon }
];

const statusDot = {
  Online: "bg-[#2b9b60]",
  Away: "bg-[#f29b3a]",
  Offline: "bg-[#b7c2d6]"
};

export function SettingsTab() {
  const [activeTab, setActiveTab] = useState("connection");
  const [notifications, setNotifications] = useState(settingsData.notifications);

  const toggleNotification = (label) => {
    setNotifications((prev) => prev.map((item) => (item.label === label ? { ...item, enabled: !item.enabled } : item)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-[#d6deea] pb-1">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-t-[10px] px-3.5 py-2.5 text-[14px] font-medium transition ${
                active ? "border-b-2 border-[#3046b2] text-[#3046b2]" : "text-[#5f6f89] hover:text-[#334463]"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "connection" ? (
        <>
          <ConnectionPanel />

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="px-5 py-5">
              <SectionTitle icon={ClockIcon} iconClass="text-[#f29b3a]">
                Business hours
              </SectionTitle>
              <div className="mt-5 space-y-3">
                {settingsData.businessHours.map(([day, hours]) => (
                  <div key={day} className="flex items-center justify-between rounded-[14px] border border-[#e7edf5] px-4 py-3">
                    <p className="text-[14px] font-medium text-[#102246]">{day}</p>
                    <p className="text-[14px] text-[#5f6f89]">{hours}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="px-5 py-5">
              <SectionTitle icon={UsersIcon} iconClass="text-[#8b52d0]">
                Team & access
              </SectionTitle>
              <div className="mt-5 space-y-3">
                {settingsData.team.map((member) => (
                  <div key={member.name} className="flex items-center justify-between rounded-[14px] border border-[#e7edf5] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`size-2.5 rounded-full ${statusDot[member.status]}`} />
                      <div>
                        <p className="text-[14px] font-medium text-[#102246]">{member.name}</p>
                        <p className="text-[12px] text-[#8592ab]">{member.role}</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-[#5f6f89]">{member.status}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="px-5 py-5 xl:col-span-2">
              <SectionTitle icon={CogIcon} iconClass="text-[#5f6f89]">
                Notification preferences
              </SectionTitle>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {notifications.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-[14px] border border-[#e7edf5] px-4 py-3">
                    <p className="text-[14px] font-medium text-[#102246]">{item.label}</p>
                    <Toggle checked={item.enabled} onChange={() => toggleNotification(item.label)} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {activeTab === "ai-agent" ? (
        <PlaceholderPanel
          icon={SparklesIcon}
          iconClass="text-[#8b52d0]"
          title="AI Agent"
          description="Configure an AI agent to draft or auto-send replies, qualify leads, and hand off to a human agent when confidence is low."
        />
      ) : null}

      {activeTab === "intelligent-reply" ? (
        <PlaceholderPanel
          icon={ZapIcon}
          iconClass="text-[#f29b3a]"
          title="Intelligent Reply"
          description="Suggest reply text to agents in real time based on the conversation, past templates, and CRM context."
        />
      ) : null}

      {activeTab === "conversions-api" ? (
        <PlaceholderPanel
          icon={ChartBarIcon}
          iconClass="text-[#2995db]"
          title="Conversions API"
          description="Send WhatsApp conversation events (replies, opt-ins, conversions) back to Meta Ads for campaign attribution."
        />
      ) : null}

      {activeTab === "integrations" ? <IntegrationsPanel /> : null}
    </div>
  );
}
