import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { GlobeIcon, LinkIcon, LockIcon, MailIcon, RadarIcon, ShieldIcon, SparklesIcon, UsersIcon, VideoIcon } from "../Icons";
import { EmployeesPanel } from "./EmployeesPanel";
import { ChannelPartnerUsersPanel } from "./ChannelPartnerUsersPanel";
import { WhatsappApiPanel } from "./WhatsappApiPanel";
import { MailboxManager } from "./MailboxManager";
import { MyAccountPanel } from "./MyAccountPanel";
import { SystemEmailPanel } from "./SystemEmailPanel";
import { AiSettingsPanel } from "./AiSettingsPanel";
import { MarketIntelSettingsPanel } from "./MarketIntelSettingsPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { ZoomConnectionPanel } from "../meetings/ZoomConnectionPanel";
import { ZoomInfoSettingsPanel } from "./ZoomInfoSettingsPanel";

const ADMIN_TABS = [
  { id: "employees", label: "Employees", icon: UsersIcon },
  { id: "channel-partners", label: "Channel Partners", icon: LinkIcon },
  { id: "ai-assistant", label: "AI Assistant", icon: SparklesIcon },
  { id: "market-intelligence-api", label: "Market Intelligence", icon: RadarIcon },
  { id: "whatsapp-api", label: "WhatsApp API", icon: LinkIcon },
  { id: "zoom-api", label: "Zoom API", icon: VideoIcon },
  { id: "zoominfo-api", label: "ZoomInfo", icon: GlobeIcon },
  { id: "system-email", label: "System Email", icon: MailIcon },
  { id: "email-accounts", label: "Email Accounts", icon: MailIcon },
  { id: "audit-log", label: "Audit Log", icon: ShieldIcon }
];
const EVERYONE_TABS = [
  { id: "my-account", label: "My Account", icon: LockIcon }
];

export function AdminPanelModule() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const tabs = isAdmin ? [...ADMIN_TABS, ...EVERYONE_TABS] : EVERYONE_TABS;
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-4">
      <section>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#eef1ff] px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3046b2]">
          <ShieldIcon className="size-4" />
          Admin Panel
        </span>
        <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">
          {isAdmin ? "Company administration" : "My account"}
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">
          {isAdmin
            ? "Manage employee logins, WhatsApp Cloud API credentials, and every SMTP mailbox in the company."
            : "Manage your own login and personal email mailbox."}
        </p>
      </section>

      <div className="flex flex-wrap gap-1.5 border-b border-[#d6deea] pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === currentTab.id;
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

      {currentTab.id === "employees" ? <EmployeesPanel /> : null}
      {currentTab.id === "channel-partners" ? <ChannelPartnerUsersPanel /> : null}
      {currentTab.id === "ai-assistant" ? <AiSettingsPanel /> : null}
      {currentTab.id === "market-intelligence-api" ? <MarketIntelSettingsPanel /> : null}
      {currentTab.id === "whatsapp-api" ? <WhatsappApiPanel /> : null}
      {currentTab.id === "zoom-api" ? <ZoomConnectionPanel /> : null}
      {currentTab.id === "zoominfo-api" ? <ZoomInfoSettingsPanel /> : null}
      {currentTab.id === "system-email" ? <SystemEmailPanel /> : null}
      {currentTab.id === "email-accounts" ? <MailboxManager scope="all" /> : null}
      {currentTab.id === "audit-log" ? <AuditLogPanel /> : null}
      {currentTab.id === "my-account" ? (
        <div className="space-y-4">
          <MyAccountPanel />
          <MailboxManager scope="mine" />
        </div>
      ) : null}
    </div>
  );
}
