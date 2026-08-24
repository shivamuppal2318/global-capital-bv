import { useEffect, useMemo, useState } from "react";
import {
  CalendarIcon,
  ChatBubbleIcon,
  FolderIcon,
  FunnelIcon,
  GridIcon,
  LogOutIcon,
  MailIcon,
  NoteIcon,
  PhoneIcon,
  PlusIcon,
  RadarIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon
} from "./components/Icons";
import { ActionButton, noteToneClass, StatCard } from "./components/ui";
import { WhatsappBusinessModule } from "./components/whatsapp/WhatsappBusinessModule";
import { AiChatPanel } from "./components/ai/AiChatPanel";
import { CrmWorkspaceModule } from "./components/crm/CrmWorkspaceModule";
import { MeetingsModule } from "./components/meetings/MeetingsModule";
// Email cold-outreach domain (merged from the `crm` branch) — three
// modules matching the existing nav placeholders.
import { EmailOutreachModule } from "./components/emailOutreach/EmailOutreachModule";
import { MarketIntelligenceModule } from "./components/marketIntelligence/MarketIntelligenceModule";
import { AdminPanelModule } from "./components/admin/AdminPanelModule";
import { DataRoomModule } from "./components/dataRoom/DataRoomModule";
import { DealStageModule } from "./components/dealStages/DealStageModule";
import { MODULE_TO_STAGE } from "./components/dealStages/stageConfig";
import { NdaModule } from "./components/relationships/NdaModule";
import { VisitPlanningModule } from "./components/relationships/VisitPlanningModule";
import { IoiModule } from "./components/relationships/IoiModule";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./components/auth/LoginPage";
import {
  coldBulkMailingData,
  commandCenterData,
  navSections,
  templatesCadencesData,
  topBarMeta
} from "./data/crmData";

const iconMap = {
  grid: GridIcon,
  radar: RadarIcon,
  sparkles: SparklesIcon,
  users: UsersIcon,
  funnel: FunnelIcon,
  mailbox: MailIcon,
  message: ChatBubbleIcon,
  phone: PhoneIcon,
  send: SendIcon,
  building: GridIcon,
  contact: UsersIcon,
  chat: MailIcon,
  calendar: CalendarIcon,
  pipeline: SendIcon,
  briefcase: GridIcon,
  shield: ShieldIcon,
  folder: FolderIcon,
  note: NoteIcon,
  userCheck: UserCheckIcon
};

const barToneClass = {
  cyan: "bg-[#1b97d2]",
  violet: "bg-[#8b52d0]",
  amber: "bg-[#ff9f35]",
  teal: "bg-[#1da5a0]",
  green: "bg-[#2ba84a]"
};

const pageAccentClass = {
  "command-center": "bg-[#5b6fcf] text-white",
  "cold-bulk-mailing": "bg-[#ffe2ea] text-[#ff4b7d]",
  "whatsapp-business": "bg-[#def4e6] text-[#179150]",
  "templates-cadences": "bg-[#ffe9ce] text-[#ff9e1a]"
};

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

const channelToneClass = {
  Email: "bg-[#ffe4ee] text-[#ef5b8f]",
  WhatsApp: "bg-[#dff5e7] text-[#2b9b60]",
  Document: "bg-[#dff2ff] text-[#2995db]"
};

const pageActions = {
  "command-center": [
    { label: "Open pipeline", icon: null, primary: true, external: true },
    { label: "Ask the assistant", icon: PlusIcon, primary: false }
  ],
  "cold-bulk-mailing": [
    { label: "New campaign", icon: PlusIcon, primary: true },
    { label: "A/B test", icon: SparklesIcon },
    { label: "Build segment", icon: UserCheckIcon }
  ],
  "templates-cadences": [
    { label: "New template", icon: PlusIcon, primary: true },
    { label: "New cadence", icon: SendIcon }
  ]
};

const pageMeta = {
  "command-center": commandCenterData,
  "cold-bulk-mailing": coldBulkMailingData,
  "templates-cadences": templatesCadencesData
};

function AppShell() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  // Admin Panel is always available (an employee still needs My Account to
  // change their password); everything else is gated on the module list an
  // admin granted them. The API enforces the same rules, so this is
  // presentation — a hidden nav item isn't the security boundary.
  const allowedSections = useMemo(() => {
    const canOpen = (id) => id === "admin-panel" || isAdmin || (user?.permissions ?? []).includes(id);
    return navSections
      .map((section) => ({ ...section, items: section.items.filter((item) => canOpen(item.id)) }))
      .filter((section) => section.items.length > 0);
  }, [user, isAdmin]);

  const allowedIds = useMemo(
    () => new Set(allowedSections.flatMap((s) => s.items.map((i) => i.id))),
    [allowedSections]
  );

  // Land on the first module they can actually open, so an employee
  // without CRM Workspace doesn't start on a blank screen.
  const [activePage, setActivePage] = useState(() =>
    allowedIds.has("crm-workspace") ? "crm-workspace" : [...allowedIds][0] ?? "admin-panel"
  );

  // Losing access to the open module (an admin revoked it mid-session)
  // shouldn't leave a dead view on screen.
  useEffect(() => {
    if (!allowedIds.has(activePage)) {
      setActivePage([...allowedIds][0] ?? "admin-panel");
    }
  }, [allowedIds, activePage]);

  const currentPage = pageMeta[activePage] ?? commandCenterData;
  const actions = pageActions[activePage] ?? [];

  const navWithActive = useMemo(
    () =>
      allowedSections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, active: item.id === activePage }))
      })),
    [allowedSections, activePage]
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#12213a]">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <Sidebar navSections={navWithActive} onChange={setActivePage} />

        <main className="min-w-0">
          <TopBar />

          <div className="space-y-6 p-6">
            {activePage === "command-center" ? (
              <CommandCenterPage />
            ) : activePage === "whatsapp-business" ? (
              <WhatsappBusinessModule onNavigate={setActivePage} />
            ) : activePage === "crm-workspace" ? (
              <CrmWorkspaceModule />
            ) : activePage === "meetings" ? (
              <MeetingsModule />
            ) : activePage === "cold-bulk-mailing" || activePage === "leads" ? (
              <EmailOutreachModule initialTab={activePage === "leads" ? "leads" : "dashboard"} />
            ) : activePage === "market-intelligence" ? (
              <MarketIntelligenceModule />
            ) : activePage === "data-room" ? (
              <DataRoomModule />
            ) : activePage === "nda" ? (
              <NdaModule />
            ) : activePage === "visit-planning" ? (
              <VisitPlanningModule />
            ) : activePage === "ioi" ? (
              <IoiModule />
            ) : MODULE_TO_STAGE[activePage] ? (
              // Field Visit and Term Sheet still share one component, keyed
              // so switching between them remounts rather than reusing the
              // previous stage's state. NDA, Zoom Call, IOI and Visit
              // Planning outgrew it and have dedicated screens above.
              <DealStageModule key={activePage} stage={MODULE_TO_STAGE[activePage]} />
            ) : activePage === "admin-panel" ? (
              <AdminPanelModule />
            ) : (
              <>
                <PageHeader pageId={activePage} page={currentPage} actions={actions} />
                <PageBody activePage={activePage} />
              </>
            )}
          </div>
        </main>
      </div>

      <AiChatPanel />
    </div>
  );
}

function Sidebar({ navSections, onChange }) {
  return (
    <aside className="hidden bg-[#1b295f] text-white md:block">
      <div className="flex min-h-screen flex-col p-4">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center overflow-hidden rounded-2xl bg-white">
            <div className="grid size-7 place-items-center rounded-full bg-[#ebf6ef] text-[12px] font-bold text-[#2b9b60]">
              GC
            </div>
          </div>
          <div>
            <p className="text-[15px] font-semibold">Global Capital BV</p>
            <p className="text-[13px] text-white/65">Funding & Investment OS</p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-[14px] bg-white/8 px-4 py-3 text-white/70">
          <SearchIcon className="size-4" />
          <input
            type="text"
            placeholder="Search modules"
            className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/50"
          />
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="mb-3 px-2 text-[11px] uppercase tracking-[0.22em] text-white/36">{section.title}</p>
              <nav className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = iconMap[item.icon] ?? GridIcon;
                  const active = Boolean(item.active);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChange(item.id)}
                      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left text-[14px] transition ${
                        active ? "bg-[#2a3c82] text-white" : "text-white/90 hover:bg-white/6"
                      }`}
                    >
                      <span
                        className={`grid size-7 place-items-center rounded-xl ${
                          active ? "bg-[#2fa84f]" : "bg-white/8"
                        }`}
                      >
                        <Icon className="size-[15px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-[#21407f] px-2 py-0.5 text-[10px] font-semibold text-white/90">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-[16px] border border-white/8 bg-white/6 px-4 py-3">
          <p className="text-[13px] font-medium">Strategic Investments,</p>
          <p className="text-[13px] text-white/70">Sustainable Growth</p>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const { user, logout } = useAuth();
  const initials = user
    ? user.name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : topBarMeta.initials;

  return (
    <div className="border-b border-[#d9e2ef] bg-[#f7f9fc] px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button type="button" className="grid size-8 place-items-center rounded-lg text-[#26354c]">
            <GridIcon className="size-4" />
          </button>
          <p className="text-[15px] font-semibold text-[#18263e]">Global Capital BV</p>
          <span className="rounded-full bg-[#d9f4df] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#179150]">
            Investment OS
          </span>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-[14px] text-[#6a7790]">
            {topBarMeta.location} · {topBarMeta.cycle}
          </p>
          {user ? (
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-[13px] font-medium leading-tight text-[#18263e]">{user.name}</p>
                <p className="text-[11px] leading-tight text-[#8592ab]">{user.role === "ADMIN" ? "Admin" : "Employee"}</p>
              </div>
              <div className="grid size-9 place-items-center rounded-full bg-[#2d47aa] text-sm font-semibold text-white">
                {initials}
              </div>
              <button
                type="button"
                onClick={logout}
                title="Log out"
                className="grid size-9 place-items-center rounded-full border border-[#d6deea] bg-white text-[#5f6f89] hover:bg-[#f4f7fb]"
              >
                <LogOutIcon className="size-4" />
              </button>
            </div>
          ) : (
            <div className="grid size-9 place-items-center rounded-full bg-[#2d47aa] text-sm font-semibold text-white">
              {initials}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ pageId, page, actions }) {
  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span
            className={`inline-flex rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] ${pageAccentClass[pageId]}`}
          >
            {page.badge}
          </span>
          <h1 className="mt-4 text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">{page.title}</h1>
          <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">{page.description}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-3 pt-1">
          {actions.map((action) => (
            <ActionButton key={action.label} {...action} />
          ))}
        </div>
      </div>

      {page.stats ? (
        <div className="mt-7 grid gap-4 xl:grid-cols-4">
          {page.stats.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CommandCenterPage() {
  const page = commandCenterData;
  return (
    <>
      <section className="overflow-hidden rounded-[24px] bg-[linear-gradient(90deg,#243d97_0%,#0f6eb3_54%,#1db164_100%)] px-8 py-9 text-white shadow-[0_10px_30px_rgba(28,52,120,0.16)]">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/14 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/95">
          <SparklesIcon className="size-4" />
          {page.badge}
        </span>
        <h1 className="mt-5 text-[3.2rem] font-semibold leading-none tracking-[-0.04em]">{page.title}</h1>
        <p className="mt-4 max-w-3xl text-[18px] leading-8 text-white/92">{page.description}</p>

        <div className="mt-7 flex flex-wrap gap-3">
          {pageActions["command-center"].map((action) => (
            <ActionButton key={action.label} {...action} hero />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        {page.stats.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">Deal flow by stage</h2>
            <button type="button" className="text-[14px] font-medium text-[#21439b]">
              View pipeline
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {page.stages.map((row) => (
              <div key={row.stage}>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <p className="text-[14px] font-semibold text-[#12213a]">{row.stage}</p>
                  <p className="text-[14px] text-[#5f6f89]">
                    {row.count} · {row.value}
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-[#e8edf5]">
                  <div className={`h-2.5 rounded-full ${barToneClass[row.tone]}`} style={{ width: row.width }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Priorities</h2>
          <div className="mt-5 space-y-3">
            {page.priorities.map((item) => (
              <div key={item.title} className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
                <p className="text-[14px] font-semibold text-[#132342]">{item.title}</p>
                <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${noteToneClass[item.tone]}`}>
                  {item.due}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function PageBody({ activePage }) {
  if (activePage === "cold-bulk-mailing") {
    return <ColdBulkMailingPage />;
  }

  if (activePage === "templates-cadences") {
    return <TemplatesCadencesPage />;
  }

  return <PlaceholderPage />;
}

function ColdBulkMailingPage() {
  const page = coldBulkMailingData;
  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Campaigns</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                  <th className="pb-3 font-medium">Campaign</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 text-right font-medium">Sent</th>
                  <th className="pb-3 text-right font-medium">Open</th>
                  <th className="pb-3 text-right font-medium">Click</th>
                  <th className="pb-3 text-right font-medium">Reply</th>
                </tr>
              </thead>
              <tbody>
                {page.campaigns.map(([name, status, sent, open, click, reply]) => (
                  <tr key={name} className="border-t border-[#e7edf5]">
                    <td className="py-4 text-[15px] font-medium text-[#102246]">{name}</td>
                    <td className="py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${campaignToneClass[status]}`}>{status}</span>
                    </td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{sent}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{open}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{click}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{reply}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Deliverability</h2>
          <div className="mt-5 space-y-4">
            {page.deliverability.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-5 place-items-center rounded-full border border-[#b8e2c8] text-[#2b9b60]">
                    <span className="size-1.5 rounded-full bg-[#2b9b60]" />
                  </span>
                  <span className="text-[15px] text-[#435471]">{label}</span>
                </div>
                <span className="text-[15px] font-medium text-[#102246]">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[18px] border border-[#ffd4a7] bg-[#fff4e7] px-4 py-4 text-[14px] leading-6 text-[#f29b3a]">
            Suppression list active: 412 unsubscribes and 38 hard bounces excluded automatically.
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <SendIcon className="size-5 text-[#21439b]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Cold sequence — Renewables Founders</h2>
        </div>
        <div className="mt-6 space-y-5">
          {page.cadenceSteps.map(([title, desc, engagement, width]) => (
            <div key={title}>
              <div className="mb-1 flex items-center justify-between gap-4">
                <p className="text-[15px] font-semibold text-[#102246]">{title}</p>
                <p className="text-[14px] text-[#5f6f89]">{engagement}</p>
              </div>
              <p className="text-[14px] text-[#5f6f89]">{desc}</p>
              <div className="mt-3 h-1.5 rounded-full bg-[#dbe2f0]">
                <div className="h-1.5 rounded-full bg-[#3046b2]" style={{ width }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplatesCadencesPage() {
  const page = templatesCadencesData;
  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <NoteIcon className="size-5 text-[#ff9e1a]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Template library</h2>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                <th className="pb-3 font-medium">Template</th>
                <th className="pb-3 font-medium">Channel</th>
                <th className="pb-3 text-right font-medium">Uses</th>
                <th className="pb-3 text-right font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {page.templateRows.map(([template, channel, uses, open]) => (
                <tr key={template} className="border-t border-[#e7edf5]">
                  <td className="py-4 text-[15px] font-medium text-[#102246]">{template}</td>
                  <td className="py-4">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${channelToneClass[channel]}`}>{channel}</span>
                  </td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{uses}</td>
                  <td className="py-4 text-right text-[15px] text-[#102246]">{open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3">
          <SparklesIcon className="size-5 text-[#8b52d0]" />
          <h2 className="text-[16px] font-semibold text-[#102246]">Cadences</h2>
        </div>
        <div className="mt-5 space-y-3">
          {page.cadences.map(([title, detail, reply]) => (
            <div key={title} className="rounded-[18px] border border-[#d6deea] px-4 py-4">
              <p className="text-[15px] font-semibold text-[#102246]">{title}</p>
              <p className="mt-2 text-[14px] text-[#5f6f89]">{detail}</p>
              <p className="mt-2 text-[14px] font-medium text-[#2b9b60]">{reply}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlaceholderPage() {
  return (
    <div className="rounded-[22px] border border-[#d6deea] bg-white px-6 py-10 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <p className="text-[16px] font-medium text-[#102246]">This view is intentionally left simple for now.</p>
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#1b295f] text-white/70">Loading…</div>;
  }
  return user ? <AppShell /> : <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
