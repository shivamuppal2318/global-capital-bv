import { useEffect, useMemo, useState } from "react";
import {
  AttachmentIcon,
  CalendarIcon,
  FunnelIcon,
  GridIcon,
  MailIcon,
  NoteIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RadarIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  TagIcon,
  UploadIcon,
  UserCheckIcon,
  UsersIcon
} from "./components/Icons";
import {
  coldBulkMailingData,
  commandCenterData,
  crmWorkspaceData,
  marketIntelligenceData,
  navSections,
  templatesCadencesData,
  topBarMeta,
  whatsappBusinessData
} from "./data/crmData";
import {
  assignCampaignEmailAccount,
  bulkCreateLeads,
  createCampaign,
  createEmailAccount,
  createLead,
  deactivateEmailAccount,
  deleteTemplate,
  fetchCampaigns,
  fetchEmailAccounts,
  fetchLeadActivity,
  fetchLeads,
  fetchMarketIntelligenceStatus,
  fetchMarketSignals,
  fetchTemplate,
  fetchTemplatePreview,
  fetchTemplates,
  pauseCampaign,
  resumeCampaign,
  runMarketIntelligencePipeline,
  saveTemplate,
  sendLeadEmail,
  sendLeadTemplateEmail,
  simulateReply,
  updateCampaign
} from "./lib/api";
import { parseLeadsCsv } from "./lib/csvLeads";

const iconMap = {
  grid: GridIcon,
  radar: RadarIcon,
  sparkles: SparklesIcon,
  users: UsersIcon,
  funnel: FunnelIcon,
  mailbox: MailIcon,
  message: SendIcon,
  phone: PhoneIcon,
  send: SendIcon,
  building: GridIcon,
  contact: UsersIcon,
  chat: MailIcon,
  calendar: CalendarIcon,
  pipeline: SendIcon,
  briefcase: GridIcon
};

const noteToneClass = {
  blue: "bg-[#eef1ff] text-[#4766cc]",
  cyan: "bg-[#dff3fb] text-[#1192cb]",
  green: "bg-[#dff5e7] text-[#2b9b60]",
  amber: "bg-[#ffe9d0] text-[#f29c38]",
  pink: "bg-[#ffe4ee] text-[#ef5b8f]",
  violet: "bg-[#efe5ff] text-[#8853d0]",
  indigo: "bg-[#e6ebff] text-[#5769d4]",
  sky: "bg-[#def1ff] text-[#2d8fd6]"
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
  "crm-workspace": "bg-[#dfe6ff] text-[#3556be]",
  "cold-bulk-mailing": "bg-[#ffe2ea] text-[#ff4b7d]",
  "whatsapp-business": "bg-[#def4e6] text-[#179150]",
  "templates-cadences": "bg-[#ffe9ce] text-[#ff9e1a]",
  "market-intelligence": "bg-[#efe5ff] text-[#8853d0]"
};

const avatarToneClass = {
  blue: "bg-[#dff1ff] text-[#2f96da]",
  amber: "bg-[#ffe6cc] text-[#f29b3a]",
  green: "bg-[#dff5e7] text-[#2a9c60]",
  violet: "bg-[#efe5ff] text-[#8b52d0]",
  sky: "bg-[#def1ff] text-[#2b94da]"
};

const campaignToneClass = {
  Sending: "bg-[#dff5e7] text-[#2b9b60]",
  Scheduled: "bg-[#dff2ff] text-[#2995db]",
  Completed: "bg-[#efe5ff] text-[#8853d0]",
  Draft: "bg-[#edf1f6] text-[#748096]"
};

const callStatusToneClass = {
  booked: "bg-[#dff2ff] text-[#2995db]",
  completed: "bg-[#dff5e7] text-[#2b9b60]",
  canceled: "bg-[#ffe4ee] text-[#ef5b8f]"
};

const relatedIcons = {
  Notes: NoteIcon,
  Attachments: AttachmentIcon,
  Emails: MailIcon,
  Calls: PhoneIcon,
  Meetings: CalendarIcon,
  Cadences: SendIcon
};

const pageActions = {
  "command-center": [
    { label: "Open pipeline", icon: null, primary: true, external: true },
    { label: "Ask the assistant", icon: PlusIcon, primary: false }
  ],
  "crm-workspace": [
    { label: "New record", icon: PlusIcon, primary: true },
    { label: "Import", icon: UploadIcon },
    { label: "Views", icon: FunnelIcon }
  ],
  // No header buttons here (deliberately) — "New campaign"/"A/B test"/
  // "Build segment" used to sit here purely decoratively (no onClick at
  // all), which looked like the primary way to create a campaign but did
  // nothing. The real, working campaign-creation form is the "Automation
  // Builder" panel further down this page (see ColdBulkMailingPage) —
  // its "Save automation" button is wired to the real POST /campaigns call.
  "whatsapp-business": [
    { label: "New broadcast", icon: SendIcon, primary: true },
    { label: "New template", icon: PlusIcon }
  ]
  // No header buttons for "templates-cadences" (deliberately) — same
  // reasoning as cold-bulk-mailing above. Templates are created/edited on
  // the Cold Bulk Mailing page, not here.
};

const pageMeta = {
  "command-center": commandCenterData,
  "crm-workspace": crmWorkspaceData,
  "cold-bulk-mailing": coldBulkMailingData,
  // Reply handling (replied leads, next automated email, activity timeline)
  // used to live crammed onto the Cold Bulk Mailing page — split out here
  // so each page stays focused: Cold Bulk Mailing owns campaign/mailbox
  // setup, Leads owns what happens once someone replies.
  leads: { title: "Leads" },
  "whatsapp-business": whatsappBusinessData,
  "templates-cadences": templatesCadencesData,
  "market-intelligence": marketIntelligenceData
};

const defaultCampaignName = coldBulkMailingData.campaigns[0][0];

function normalizeCampaigns(campaigns) {
  return campaigns.map(([name, status, sent, open, click, reply], index) => ({
    id: `${name}-${index}`,
    name,
    status,
    sent,
    open,
    click,
    reply
  }));
}

function buildAutomationSteps(campaignName, delayDays, followUpCount) {
  const baseLabel = campaignName.split("—")[0].trim();
  return Array.from({ length: followUpCount + 1 }, (_, index) => {
    const day = index * delayDays;
    if (index === 0) {
      return {
        title: `Day 0 · Intro email`,
        desc: `${baseLabel} intro with mandate fit and one-line credibility proof`
      };
    }

    return {
      title: `Day ${day} · Follow-up ${index}`,
      desc: index === 1 ? "Follow-up with sector teaser and CTA for interest." : "Reminder with proof-point and suggested next step."
    };
  });
}

function buildWorkflowSteps(flowState) {
  const steps = [
    {
      key: "outreach",
      title: "Outreach",
      desc: "Intro email with brochure and mandate summary.",
      state: "done"
    },
    {
      key: "interest",
      title: "Interest detected",
      desc: "Lead replied positively or asked for more details.",
      state: flowState.replyType === "no-reply" ? "pending" : "done"
    }
  ];

  if (flowState.replyType === "interested") {
    steps.push({
      key: "nda",
      title: "Send NDA e-signature",
      desc: "Auto-send NDA email and schedule up to 2 reminders, 3 working days apart.",
      state: "done"
    });
    steps.push({
      key: "zoom1",
      title: "Schedule Zoom Call 1",
      desc: "Send booking link and confirm introductory Zoom meeting.",
      state: flowState.preferredPath === "zoom-first" ? "done" : "current"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Ask for documents and trigger AI gap-check follow-up reminders.",
      state: flowState.preferredPath === "nda-first" ? "current" : "pending"
    });
    steps.push({
      key: "ioi",
      title: "IOI / LOI follow-up",
      desc: "After complete data room, send IOI/LOI instruction email.",
      state: "pending"
    });
  } else if (flowState.replyType === "zoom-request") {
    steps.push({
      key: "zoom1",
      title: "Schedule Zoom Call 1 first",
      desc: "Lead prefers a meeting before NDA. Auto-send Zoom link and reminder email.",
      state: "current"
    });
    steps.push({
      key: "nda-after-zoom",
      title: "Post-Zoom NDA email",
      desc: "After Zoom completion, send NDA and supporting deck automatically.",
      state: "pending"
    });
    steps.push({
      key: "data-room",
      title: "Request Data Room",
      desc: "Once NDA is signed, send data-room request and reminder flow.",
      state: "pending"
    });
  } else if (flowState.replyType === "info-request") {
    steps.push({
      key: "info-pack",
      title: "Send info pack",
      desc: "Auto-reply with teaser, deck, and CTA asking for NDA or Zoom preference.",
      state: "current"
    });
    steps.push({
      key: "decision-branch",
      title: "Branch to NDA or Zoom",
      desc: "Based on their next reply, move them to NDA-first or Zoom-first path.",
      state: "pending"
    });
  } else {
    steps.push({
      key: "reminder-1",
      title: "Reminder 1",
      desc: "If no reply, send first reminder after configured delay.",
      state: "current"
    });
    steps.push({
      key: "reminder-2",
      title: "Reminder 2",
      desc: "If still no reply, send second reminder 3 working days later.",
      state: "pending"
    });
    steps.push({
      key: "close",
      title: "Mark cold / recycle",
      desc: "Stop emails and move lead to future re-engagement segment.",
      state: "pending"
    });
  }

  return steps;
}

function buildReplyAction(flowState) {
  if (flowState.replyType === "interested") {
    return {
      subject: "NDA signature + next steps",
      body: "Thanks for the interest. Please find the NDA signature link attached. Once signed, we will unlock the next diligence step and share the data-room request checklist.",
      cta: "Send NDA email"
    };
  }

  if (flowState.replyType === "zoom-request") {
    return {
      subject: "Book an intro call",
      body: "Great to hear from you. Here is our Calendly link to book an introductory call at a time that works for you: https://calendly.com/globalcapitalbv/intro-call. We'll cover mandate fit and next steps before moving to NDA and diligence.",
      cta: "Send Calendly invite"
    };
  }

  if (flowState.replyType === "info-request") {
    return {
      subject: "Brochure, teaser, and next-step options",
      body: "Sharing the teaser and company overview. If aligned, we can either send the NDA directly or schedule a first Zoom call this week.",
      cta: "Send info pack"
    };
  }

  return {
    subject: "Final follow-up",
    body: "Just checking back on the note below. Happy to share the teaser again or close the loop if timing is not right.",
    cta: "Send reminder"
  };
}

const replyRules = [
  { id: "nda", label: 'Reply contains "NDA"', keywords: ["nda", "sign"], replyType: "interested" },
  { id: "zoom", label: 'Reply contains "call/zoom"', keywords: ["zoom", "call", "meeting"], replyType: "zoom-request" },
  { id: "info", label: 'Reply contains "deck/details"', keywords: ["deck", "detail", "brochure", "info"], replyType: "info-request" }
];

function getStageFromReplyType(replyType, preferredPath) {
  if (replyType === "interested") {
    return preferredPath === "zoom-first" ? "Zoom 1 Pending" : "NDA Sent";
  }
  if (replyType === "zoom-request") {
    return "Zoom 1 Pending";
  }
  if (replyType === "info-request") {
    return "Info Shared";
  }
  return "Reminder Pending";
}

// Backend enums are UPPER_SNAKE (Prisma ReplyType/CampaignStatus); the
// frontend has always used lowercase-dash strings for reply types and
// Title Case for campaign status. Translate at the boundary rather than
// letting either convention leak into the other.
const backendReplyTypeMap = {
  INTERESTED: "interested",
  ZOOM_REQUEST: "zoom-request",
  INFO_REQUEST: "info-request",
  NO_REPLY: "no-reply"
};

function backendReplyTypeToLocal(replyType) {
  return backendReplyTypeMap[replyType] ?? "no-reply";
}

const backendCampaignStatusMap = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  COMPLETED: "Completed"
};

function backendCampaignStatusToLocal(status) {
  return backendCampaignStatusMap[status] ?? "Draft";
}

function App() {
  const [activePage, setActivePage] = useState("crm-workspace");
  const [crmLeadOverrides, setCrmLeadOverrides] = useState({});
  const mailing = useMailingState(setCrmLeadOverrides);
  const currentPage = pageMeta[activePage] ?? commandCenterData;
  const actions = pageActions[activePage] ?? [];

  const navWithActive = useMemo(
    () =>
      navSections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, active: item.id === activePage }))
      })),
    [activePage]
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
            ) : (
              <>
                <PageHeader pageId={activePage} page={currentPage} actions={actions} />
                <PageBody activePage={activePage} crmLeadOverrides={crmLeadOverrides} mailing={mailing} />
              </>
            )}
          </div>
        </main>
      </div>
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
          <div className="grid size-9 place-items-center rounded-full bg-[#2d47aa] text-sm font-semibold text-white">
            {topBarMeta.initials}
          </div>
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
          {page.badge ? (
            <span
              className={`inline-flex rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] ${pageAccentClass[pageId]}`}
            >
              {page.badge}
            </span>
          ) : null}
          <h1 className={`${page.badge ? "mt-4" : ""} text-[3.1rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]`}>{page.title}</h1>
          {page.description ? <p className="mt-3 max-w-3xl text-[18px] leading-8 text-[#4f6181]">{page.description}</p> : null}
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

function PageBody({ activePage, crmLeadOverrides, mailing }) {
  if (activePage === "crm-workspace") {
    return <CrmWorkspacePage crmLeadOverrides={crmLeadOverrides} />;
  }

  if (activePage === "cold-bulk-mailing") {
    return <ColdBulkMailingPage mailing={mailing} />;
  }

  if (activePage === "leads") {
    return <LeadsPage mailing={mailing} />;
  }

  if (activePage === "whatsapp-business") {
    return <WhatsappBusinessPage />;
  }

  if (activePage === "templates-cadences") {
    return <TemplatesCadencesPage />;
  }

  if (activePage === "market-intelligence") {
    return <MarketIntelligencePage />;
  }

  return <PlaceholderPage />;
}

function CrmWorkspacePage({ crmLeadOverrides }) {
  const page = crmWorkspaceData;
  const enquiries = page.enquiries.map((item) => {
    const override = crmLeadOverrides[item.name];
    return override
      ? {
          ...item,
          status: override.status,
          company: override.company ?? item.company,
          ask: override.ask ?? item.ask,
          active: override.active ?? item.active
        }
      : item;
  });
  return (
    <section className="grid gap-4 xl:grid-cols-[320px_1fr_260px]">
      <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">New Enquiries</h2>
          <p className="mt-1 text-[14px] text-[#6a7790]">5 of 55 records</p>
        </div>
        <div>
          {enquiries.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                item.active ? "bg-[#f5f8fd]" : ""
              }`}
            >
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${avatarToneClass[item.tone]}`}>
                {item.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[15px] font-semibold text-[#102246]">{item.name}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[item.tone]}`}>{item.status}</span>
                </div>
                <p className="mt-1 truncate text-[14px] text-[#435471]">
                  {item.company} · {item.ask}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-full bg-[#ffe6cc] text-[15px] font-semibold text-[#f29b3a]">
                {page.lead.initials}
              </div>
              <div>
                <p className="text-[18px] font-semibold text-[#102246]">{page.lead.name}</p>
                <p className="mt-1 text-[14px] text-[#5f6f89]">
                  {page.lead.company} · Owner {page.lead.owner}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <ActionButton label="Send Mail" icon={MailIcon} primary />
              <ActionButton label="WhatsApp" icon={SendIcon} />
              <ActionButton label="Call" icon={PhoneIcon} />
              <ActionButton label="Convert" icon={UserCheckIcon} />
              <ActionButton label="Edit" icon={PencilIcon} />
              <ActionButton label="Tags" icon={TagIcon} />
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="inline-flex rounded-[14px] bg-[#edf2f7] p-1">
            {["Overview", "Timeline", "Interactions"].map((tab, index) => (
              <button
                key={tab}
                type="button"
                className={`rounded-[12px] px-4 py-2 text-[15px] font-medium ${
                  index === 0 ? "bg-white text-[#102246] shadow-sm" : "text-[#5f6f89]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Lead Information</p>
            <div className="mt-4 grid gap-x-6 gap-y-0 md:grid-cols-2">
              {page.overview.map(([label, value]) => (
                <div key={label} className="border-b border-dashed border-[#d9e2ef] py-4">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-[#6d7c96]">{label}</p>
                  <p className="mt-2 text-[15px] font-medium text-[#102246]">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#53627d]">Related Lists</p>
        <div className="mt-6 space-y-5">
          {page.related.map(([label, count]) => {
            const Icon = relatedIcons[label] ?? GridIcon;
            return (
              <div key={label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-[#102246]">
                  <Icon className="size-4 text-[#5f6f89]" />
                  <span className="text-[15px] font-medium">{label}</span>
                </div>
                <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[12px] font-semibold text-[#5f6f89]">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Shared by both ColdBulkMailingPage (campaign setup) and LeadsPage (reply
// handling) — split into two pages for readability, but they operate on
// the same campaigns/leads/automation-form state, so it's owned once here
// and passed down, rather than duplicated per-page (which would desync the
// two pages' view of the same data) or lifted directly into App() (which
// would make App() itself as cluttered as the page used to be).
function useMailingState(setCrmLeadOverrides) {
  const [campaigns, setCampaigns] = useState(() => normalizeCampaigns(coldBulkMailingData.campaigns));
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => normalizeCampaigns(coldBulkMailingData.campaigns)[0].id);
  // Starts empty — no fabricated demo leads. Populated for real by the
  // fetchLeads() effect below once the backend has actual replied leads
  // (from real inbound replies, or from clicking "Simulate reply" against
  // a real lead).
  const [repliedLeads, setRepliedLeads] = useState([]);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [leadActivity, setLeadActivity] = useState({});
  const [templateDrafts, setTemplateDrafts] = useState({
    interested: {
      subject: "NDA & next steps — {{company}}",
      body: "Hi {{leadName}},\n\nThank you for the quick response — glad to hear {{company}} is aligned with the mandate.\n\nTo move forward, please review and sign our NDA here: {{ndaSignUrl}}\n\nOnce we have your signature on file, we'll unlock the next stage of diligence and share our data-room request checklist so we can move efficiently from here.\n\nHappy to jump on a call in parallel if that's useful — just let us know.\n\nBest regards,\nGlobal Capital BV"
    },
    "zoom-request": {
      subject: "Let's find time for an intro call",
      body: "Hi {{leadName}},\n\nThanks for getting back to us — happy to start with a quick call before any paperwork.\n\nYou can pick a time that works for you here: https://calendly.com/globalcapitalbv/intro-call\n\nOn the call, we'll cover mandate fit, where {{company}} sits versus our current thesis, and next steps if it looks like a good match. It should take about 20–30 minutes.\n\nLooking forward to speaking.\n\nBest regards,\nGlobal Capital BV"
    },
    "info-request": {
      subject: "Teaser, overview, and next steps for {{company}}",
      body: "Hi {{leadName}},\n\nThanks for your interest — please find our teaser and company overview attached for your review.\n\nIf the mandate looks like a fit once you've had a look, there are two ways to move forward from here: sign our NDA to unlock the full diligence materials, or schedule a short introductory call first to walk through fit and answer any questions.\n\nLet us know which works better and we'll get it set up right away.\n\nBest regards,\nGlobal Capital BV"
    },
    "no-reply": {
      subject: "Following up — still worth a look?",
      body: "Hi {{leadName}},\n\nJust circling back on my note below in case it slipped through — wanted to check whether this is still worth a look for {{company}}.\n\nHappy to re-share the teaser, answer any quick questions, or simply close the loop if the timing isn't right at the moment.\n\nEither way, thanks for taking a look.\n\nBest regards,\nGlobal Capital BV"
    }
  });

  // Load once on mount: if the backend has saved versions of these
  // templates (from a previous "Save template" click, possibly in a
  // different session), prefer them over the hardcoded defaults above.
  // Silent on failure — backend-unreachable is the expected common case in
  // this environment, not an error worth interrupting the user over.
  useEffect(() => {
    const templateKeys = ["interested", "zoom-request", "info-request", "no-reply"];
    templateKeys.forEach((key) => {
      fetchTemplate(key)
        .then((template) => {
          setTemplateDrafts((current) => ({
            ...current,
            [key]: { subject: template.subject, body: template.body }
          }));
        })
        .catch(() => {
          // No saved template for this key yet, or backend unreachable —
          // keep the local default.
        });
    });
  }, []);

  // Prefer the backend's real campaigns over the local mock table when
  // reachable — this is also what makes pause/resume actually work for
  // real, since the local mock campaigns' synthesized ids never matched
  // real DB ids. Open/click are real now (aggregated server-side from the
  // ActivityLog rows the tracking pixel/click-redirect actually write —
  // see GET /campaigns' engagement field); "sent"/"reply" columns still
  // show "—" since nothing aggregates those yet.
  useEffect(() => {
    fetchCampaigns()
      .then((backendCampaigns) => {
        if (!backendCampaigns.length) {
          return;
        }
        const mapped = backendCampaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: backendCampaignStatusToLocal(campaign.status),
          sent: campaign.engagement?.sent ? String(campaign.engagement.sent) : "—",
          open: campaign.engagement?.openRate != null ? `${campaign.engagement.openRate}%` : "—",
          click: campaign.engagement?.clickRate != null ? `${campaign.engagement.clickRate}%` : "—",
          reply: "—"
        }));
        setCampaigns(mapped);
        setSelectedCampaignId(mapped[0].id);
        setAutomationNotice(`Loaded ${mapped.length} campaign(s) from the backend.`);
      })
      .catch(() => {
        // Backend unreachable or no DB migrated yet — keep the local mock
        // campaigns table already seeded above.
      });
  }, []);

  // Same pattern for leads: only overwrite the local mock repliedLeads list
  // if the backend actually returned something with at least one reply on
  // record, so an empty/fresh database doesn't wipe out the demo data.
  useEffect(() => {
    fetchLeads()
      .then((backendLeads) => {
        const replied = backendLeads.filter((lead) => lead.replyType !== "NO_REPLY");
        if (!replied.length) {
          return;
        }
        const mapped = replied.map((lead) => {
          const localReplyType = backendReplyTypeToLocal(lead.replyType);
          return {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            campaign: lead.campaign?.name ?? "",
            replyType: localReplyType,
            replyPreview: "Reply received — see activity timeline for the full message.",
            lastReplyAt: new Date(lead.updatedAt).toLocaleString(),
            owner: lead.owner,
            movedToWorkflow: true,
            stage: lead.stage,
            bounced: lead.bounced,
            unsubscribed: lead.unsubscribed,
            callStatus: lead.callCanceledAt
              ? "canceled"
              : lead.callCompletedAt
                ? "completed"
                : lead.callBookedAt
                  ? "booked"
                  : null
          };
        });
        setRepliedLeads(mapped);
        setSelectedLeadId(mapped[0].id);
        setAutomationNotice(`Loaded ${mapped.length} replied lead(s) from the backend.`);
      })
      .catch(() => {
        // Backend unreachable — repliedLeads stays empty rather than
        // showing fabricated leads.
      });
  }, []);

  // Refresh the activity timeline from the backend whenever the selected
  // lead changes — fetchLeadActivity was defined in lib/api.js from the
  // start but never actually called anywhere until now.
  useEffect(() => {
    if (!selectedLeadId) {
      return;
    }
    fetchLeadActivity(selectedLeadId)
      .then((backendActivity) => {
        if (!backendActivity.length) {
          return;
        }
        const mapped = backendActivity.map((entry) => ({
          at: new Date(entry.createdAt).toLocaleString(),
          title: entry.title,
          detail: entry.detail
        }));
        setLeadActivity((current) => ({ ...current, [selectedLeadId]: mapped }));
      })
      .catch(() => {
        // Keep whatever's already in local leadActivity for this lead.
      });
  }, [selectedLeadId]);

  const [automationForm, setAutomationForm] = useState({
    campaignName: defaultCampaignName,
    audience: "Renewables founders",
    template: "Cold intro — Renewables founder",
    delayDays: "3",
    followUpCount: "3",
    dailyLimit: "2000",
    abTest: true,
    autoPause: true,
    replyType: "interested",
    preferredPath: "nda-first"
  });
  const [automationNotice, setAutomationNotice] = useState("Automation ready. Select a campaign or create a new sequence.");
  const [newLeadForm, setNewLeadForm] = useState({ name: "", company: "", email: "" });
  const [csvText, setCsvText] = useState("");
  const [previewHtml, setPreviewHtml] = useState(null);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [newAccountForm, setNewAccountForm] = useState({
    label: "",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    fromAddress: "",
    dailyLimit: "500"
  });

  // Load once on mount — falls back to an empty list (the "add a mailbox"
  // form still works standalone) if the backend's unreachable.
  useEffect(() => {
    fetchEmailAccounts()
      .then((accounts) => setEmailAccounts(accounts))
      .catch(() => {
        // Backend unreachable — leave the list empty rather than erroring.
      });
  }, []);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
    campaigns[0];
  const selectedLead =
    repliedLeads.find((lead) => lead.id === selectedLeadId) ??
    repliedLeads[0];
  const selectedLeadTimeline = selectedLead ? leadActivity[selectedLead.id] ?? [] : [];
  const activeReplyRule = replyRules.find((rule) => rule.replyType === automationForm.replyType) ?? null;

  const liveSteps = buildAutomationSteps(
    automationForm.campaignName,
    Number(automationForm.delayDays) || 3,
    Number(automationForm.followUpCount) || 3
  );
  const workflowSteps = buildWorkflowSteps(automationForm);
  const defaultReplyAction = buildReplyAction(automationForm);
  const replyAction = {
    ...defaultReplyAction,
    subject: templateDrafts[automationForm.replyType]?.subject ?? defaultReplyAction.subject,
    body: templateDrafts[automationForm.replyType]?.body ?? defaultReplyAction.body
  };

  function handleFormChange(key, value) {
    setAutomationForm((current) => ({ ...current, [key]: value }));
  }

  function handleTemplateDraftChange(field, value) {
    setTemplateDrafts((current) => ({
      ...current,
      [automationForm.replyType]: {
        ...current[automationForm.replyType],
        [field]: value
      }
    }));
  }

  function handleApplyRule(rule) {
    const nextPreferredPath = rule.replyType === "zoom-request" ? "zoom-first" : "nda-first";
    setAutomationForm((current) => ({
      ...current,
      replyType: rule.replyType,
      preferredPath: nextPreferredPath
    }));
    setAutomationNotice(`Rule applied: ${rule.label} → classified as "${rule.replyType}".`);
  }

  function loadLeadIntoWorkflow(lead) {
    setSelectedLeadId(lead.id);
    setAutomationForm((current) => ({
      ...current,
      campaignName: lead.campaign,
      replyType: lead.replyType,
      preferredPath: lead.replyType === "zoom-request" ? "zoom-first" : "nda-first"
    }));
    setAutomationNotice(`${lead.name} moved from bulk replies into the workflow automation queue.`);
  }

  async function handleToggleCampaignStatus() {
    if (!selectedCampaign) {
      return;
    }

    const nextStatus = selectedCampaign.status === "Sending" ? "Scheduled" : "Sending";

    try {
      if (nextStatus === "Sending") {
        await resumeCampaign(selectedCampaign.id);
      } else {
        await pauseCampaign(selectedCampaign.id);
      }
      setAutomationNotice(
        nextStatus === "Sending"
          ? `${selectedCampaign.name} resumed via the backend and is now sending.`
          : `${selectedCampaign.name} paused via the backend and moved back to scheduled.`
      );
      setCampaigns((current) =>
        current.map((campaign) =>
          campaign.id === selectedCampaign.id ? { ...campaign, status: nextStatus } : campaign
        )
      );
    } catch (error) {
      // No local-only fallback — a status change that only exists in this
      // browser tab isn't real, so don't pretend it happened.
      setAutomationNotice(`Could not ${nextStatus === "Sending" ? "resume" : "pause"} "${selectedCampaign.name}" via the backend (${error.message}).`);
    }
  }

  async function handleAddLead() {
    if (!newLeadForm.name || !newLeadForm.company || !newLeadForm.email) {
      setAutomationNotice("Fill in name, company, and email before adding a lead.");
      return;
    }
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    try {
      // Only succeeds against a campaign actually loaded from the backend
      // (real DB id) — see the note on handleToggleCampaignStatus.
      const result = await createLead({
        name: newLeadForm.name,
        company: newLeadForm.company,
        email: newLeadForm.email,
        owner: "Rahul R",
        campaignId: selectedCampaign.id
      });
      setAutomationNotice(
        `${newLeadForm.name} added to "${selectedCampaign.name}" — ${result.cadenceScheduled} follow-up step(s) scheduled.`
      );
      setNewLeadForm({ name: "", company: "", email: "" });
    } catch (error) {
      setAutomationNotice(`Could not add lead via the backend (${error.message}). No local-only fallback for this action.`);
    }
  }

  async function handleImportCsv() {
    if (!csvText.trim()) {
      setAutomationNotice("Paste some CSV rows first.");
      return;
    }
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    const { rows, errors } = parseLeadsCsv(csvText);
    if (rows.length === 0) {
      setAutomationNotice(`CSV import: nothing to import. ${errors[0] ?? ""}`);
      return;
    }

    try {
      const result = await bulkCreateLeads(selectedCampaign.id, rows);
      const parseErrorNote = errors.length ? ` ${errors.length} row(s) skipped during parsing (see console).` : "";
      if (errors.length) {
        console.warn("CSV parse errors:", errors);
      }
      setAutomationNotice(
        `CSV import: ${result.createdCount} lead(s) added to "${selectedCampaign.name}", ${result.failedCount} failed on the backend.${parseErrorNote}`
      );
      setCsvText("");
    } catch (error) {
      setAutomationNotice(`CSV import failed via the backend (${error.message}). No local-only fallback for this action.`);
    }
  }

  async function handleAddEmailAccount() {
    const { label, smtpHost, smtpUser, smtpPass, fromAddress } = newAccountForm;
    if (!label || !smtpHost || !smtpUser || !smtpPass || !fromAddress) {
      setAutomationNotice("Fill in label, host, user, password, and from-address before adding a mailbox.");
      return;
    }

    try {
      const account = await createEmailAccount({
        label,
        smtpHost,
        smtpPort: Number(newAccountForm.smtpPort) || 587,
        smtpSecure: newAccountForm.smtpSecure,
        smtpUser,
        smtpPass,
        fromAddress,
        dailyLimit: Number(newAccountForm.dailyLimit) || 500
      });
      setEmailAccounts((current) => [...current, account]);
      setNewAccountForm({
        label: "",
        smtpHost: "",
        smtpPort: "587",
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        fromAddress: "",
        dailyLimit: "500"
      });
      setAutomationNotice(`Mailbox "${account.label}" added — assign it to a campaign below.`);
    } catch (error) {
      setAutomationNotice(`Could not add mailbox via the backend (${error.message}). No local-only fallback for this action.`);
    }
  }

  async function handleAssignAccountToCampaign(event) {
    const emailAccountId = event.target.value || null;
    if (!selectedCampaign) {
      setAutomationNotice("Select a campaign first.");
      return;
    }

    try {
      // Only succeeds against a campaign actually loaded from the backend
      // (real DB id) — see the note on handleToggleCampaignStatus.
      const updated = await assignCampaignEmailAccount(selectedCampaign.id, emailAccountId);
      setCampaigns((current) =>
        current.map((campaign) => (campaign.id === selectedCampaign.id ? { ...campaign, emailAccountId: updated.emailAccountId } : campaign))
      );
      const account = emailAccounts.find((acc) => acc.id === emailAccountId);
      setAutomationNotice(
        emailAccountId
          ? `"${selectedCampaign.name}" now sends through "${account?.label ?? emailAccountId}".`
          : `"${selectedCampaign.name}" reverted to the default mailbox.`
      );
    } catch (error) {
      setAutomationNotice(`Could not assign mailbox via the backend (${error.message}).`);
    }
  }

  async function handleDeactivateAccount(accountId) {
    try {
      await deactivateEmailAccount(accountId);
      setEmailAccounts((current) => current.map((acc) => (acc.id === accountId ? { ...acc, isActive: false } : acc)));
      setAutomationNotice("Mailbox deactivated.");
    } catch (error) {
      setAutomationNotice(`Could not deactivate mailbox via the backend (${error.message}).`);
    }
  }

  async function handleSaveAutomation() {
    const followUpCount = Number(automationForm.followUpCount) || 3;
    const dailyLimit = Number(automationForm.dailyLimit) || 2000;
    const delayDays = Number(automationForm.delayDays) || 3;
    const payload = {
      audience: automationForm.audience,
      template: automationForm.template,
      dailyLimit,
      delayDays,
      followUpCount,
      abTest: automationForm.abTest,
      autoPause: automationForm.autoPause
    };

    // The campaign name still matching the currently-selected (already
    // real, backend-loaded) campaign means the user is tweaking its
    // settings, not starting a new one — update it in place instead of
    // creating a same-name duplicate row (which POST /campaigns doesn't
    // prevent, since name isn't unique). No local-only fallback either
    // way — a campaign that only exists in this browser tab can't
    // actually send anything.
    const isEditingSelected = selectedCampaign && selectedCampaign.name === automationForm.campaignName;

    try {
      if (isEditingSelected) {
        const campaign = await updateCampaign(selectedCampaign.id, payload);
        setCampaigns((current) => current.map((c) => (c.id === campaign.id ? { ...c, ...payload } : c)));
        setAutomationNotice(`"${campaign.name}" updated on the backend — ${followUpCount + 1} automated touches, ${dailyLimit}/day cap.`);
        return;
      }

      const campaign = await createCampaign({ name: automationForm.campaignName, ...payload });
      const mapped = {
        id: campaign.id,
        name: campaign.name,
        status: backendCampaignStatusToLocal(campaign.status),
        sent: "—",
        open: "—",
        click: "—",
        reply: "—"
      };

      setCampaigns((current) => [mapped, ...current]);
      setSelectedCampaignId(mapped.id);
      setAutomationNotice(
        `"${mapped.name}" saved to the backend — ${followUpCount + 1} automated touches, ${dailyLimit}/day cap. Note: it has no cadence steps yet — POST /campaigns doesn't accept those.`
      );
    } catch (error) {
      setAutomationNotice(`Could not save "${automationForm.campaignName}" — backend unreachable (${error.message}).`);
    }
  }

  async function handleSendNextEmail() {
    if (!selectedLead) {
      return;
    }

    const nextStage = getStageFromReplyType(automationForm.replyType, automationForm.preferredPath);

    // Two-tier: prefer sending via the saved Template (backend applies
    // merge fields, branded HTML, unsubscribe link, deliverability checks
    // automatically) → fall back to the hand-edited subject/body if no
    // template exists for this reply type or that call fails for some
    // other reason. No local-only fallback if both real sends fail — CRM
    // state below only updates once an email has actually gone out.
    let sendDetail;
    try {
      await sendLeadTemplateEmail(selectedLead.id, automationForm.replyType);
      sendDetail = `Sent via backend using template "${automationForm.replyType}". CRM updated to ${nextStage}.`;
      setAutomationNotice(
        `${replyAction.cta} sent to ${selectedLead.name} (${selectedLead.company}) via the "${automationForm.replyType}" template. CRM moved to ${nextStage}.`
      );
    } catch (templateError) {
      try {
        await sendLeadEmail(selectedLead.id, { subject: replyAction.subject, body: replyAction.body });
        sendDetail = `Sent via backend email provider (raw subject/body, template send failed: ${templateError.message}). CRM updated to ${nextStage}.`;
        setAutomationNotice(
          `${replyAction.cta} sent to ${selectedLead.name} (${selectedLead.company}) via the backend. CRM moved to ${nextStage}.`
        );
      } catch (error) {
        setAutomationNotice(
          `Could not send "${replyAction.cta}" to ${selectedLead.name} (${selectedLead.company}) — backend unreachable (${error.message}). Nothing was sent, CRM unchanged.`
        );
        return;
      }
    }

    setRepliedLeads((current) =>
      current.map((lead) =>
        lead.id === selectedLead.id
          ? {
              ...lead,
              movedToWorkflow: true,
              lastReplyAt: "Queued just now",
              stage: nextStage,
              replyType: automationForm.replyType
            }
          : lead
      )
    );
    setLeadActivity((current) => ({
      ...current,
      [selectedLead.id]: [
        {
          at: "August 15, 2026 · Just now",
          title: replyAction.cta,
          detail: sendDetail
        },
        ...(current[selectedLead.id] ?? [])
      ]
    }));
    setCrmLeadOverrides((current) => ({
      ...current,
      [selectedLead.name]: {
        status: nextStage,
        company: selectedLead.company,
        active: true
      }
    }));
    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.name === selectedLead.campaign
          ? {
              ...campaign,
              reply: `${Math.min(15, Number.parseInt(campaign.reply, 10) + 1)}%`
            }
          : campaign
      )
    );
  }

  async function handleSaveTemplate() {
    const templateKey = automationForm.replyType;
    try {
      await saveTemplate(templateKey, { subject: replyAction.subject, body: replyAction.body });
      setAutomationNotice(`Template "${templateKey}" saved to the backend — reused for every future send of this reply type.`);
    } catch (error) {
      setAutomationNotice(
        `Template "${templateKey}" kept locally only — backend unreachable (${error.message}). It will reset on refresh.`
      );
    }
  }

  async function handlePreviewTemplate() {
    const templateKey = automationForm.replyType;
    try {
      const rendered = await fetchTemplatePreview(templateKey);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setAutomationNotice(
        `Could not load a preview for "${templateKey}" (${error.message}). Save the template to the backend first — preview renders the saved version, not unsaved edits.`
      );
    }
  }

  async function simulateIncomingReply() {
    const sampleReplyTexts = [
      "This looks relevant. Please share the NDA so we can sign and move forward.",
      "Can we do a short Zoom call first next week before paperwork?",
      "Please send more information and the brochure/deck."
    ];
    const replyPreview = sampleReplyTexts[repliedLeads.length % sampleReplyTexts.length];

    // Classifies a reply against the selected lead through the actual
    // backend (same rule engine as the UI's chips, run server-side) — this
    // is what proves the classifier the chips demo is the same one that
    // would run on a real inbound reply. No local-only fallback: without a
    // selected real lead or a reachable backend, there's nothing genuine to
    // simulate, so this just reports why instead of fabricating one.
    if (!selectedLead) {
      setAutomationNotice("Select a lead first — there's no real lead to simulate a reply for.");
      return;
    }

    try {
      const result = await simulateReply(selectedLead.id, replyPreview);
      const localReplyType = backendReplyTypeToLocal(result.replyType);
      const nextPreferredPath = localReplyType === "zoom-request" ? "zoom-first" : "nda-first";
      const nextStage = getStageFromReplyType(localReplyType, nextPreferredPath);

      setRepliedLeads((current) =>
        current.map((lead) =>
          lead.id === selectedLead.id
            ? { ...lead, replyType: localReplyType, replyPreview, lastReplyAt: "Today · Just now", stage: nextStage, movedToWorkflow: true }
            : lead
        )
      );
      setLeadActivity((current) => ({
        ...current,
        [selectedLead.id]: [
          { at: new Date().toLocaleString(), title: "Reply received (classified via backend)", detail: replyPreview },
          ...(current[selectedLead.id] ?? [])
        ]
      }));
      setAutomationForm((current) => ({
        ...current,
        campaignName: selectedLead.campaign,
        replyType: localReplyType,
        preferredPath: nextPreferredPath
      }));
      setAutomationNotice(`${selectedLead.company} replied — classified by the backend as "${localReplyType}".`);
    } catch (error) {
      setAutomationNotice(`Could not classify a reply for ${selectedLead.company} — backend unreachable (${error.message}).`);
    }
  }

  return {
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    repliedLeads, selectedLeadId, setSelectedLeadId, leadActivity,
    automationForm, automationNotice, newLeadForm, setNewLeadForm,
    csvText, setCsvText, previewHtml, setPreviewHtml,
    emailAccounts, newAccountForm, setNewAccountForm,
    selectedCampaign, selectedLead, selectedLeadTimeline, activeReplyRule,
    liveSteps, workflowSteps, replyAction,
    handleFormChange, handleTemplateDraftChange, handleApplyRule, loadLeadIntoWorkflow,
    handleToggleCampaignStatus, handleAddLead, handleImportCsv, handleAddEmailAccount,
    handleAssignAccountToCampaign, handleDeactivateAccount, handleSaveAutomation,
    handleSendNextEmail, handleSaveTemplate, handlePreviewTemplate, simulateIncomingReply
  };
}

function ColdBulkMailingPage({ mailing }) {
  const {
    campaigns, selectedCampaignId, setSelectedCampaignId, setAutomationForm,
    selectedCampaign, emailAccounts, handleAssignAccountToCampaign, handleToggleCampaignStatus,
    newLeadForm, setNewLeadForm, handleAddLead, csvText, setCsvText, handleImportCsv,
    newAccountForm, setNewAccountForm, handleAddEmailAccount, handleDeactivateAccount,
    automationForm, handleFormChange, handleSaveAutomation, automationNotice
  } = mailing;
  // Purely a UI toggle (which entry method is showing) — doesn't need to
  // survive navigating away from this page, so it stays local instead of
  // living in the shared mailing state.
  const [leadEntryMode, setLeadEntryMode] = useState("single");

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">Campaigns</h2>
            <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
              {campaigns.length} active setups
            </span>
          </div>
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
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className={`cursor-pointer border-t border-[#e7edf5] transition hover:bg-[#f8faff] ${
                      campaign.id === selectedCampaignId ? "bg-[#f5f8fd]" : ""
                    }`}
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      setAutomationForm((current) => ({ ...current, campaignName: campaign.name }));
                    }}
                  >
                    <td className="py-4 text-[15px] font-medium text-[#102246]">{campaign.name}</td>
                    <td className="py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${campaignToneClass[campaign.status]}`}>{campaign.status}</span>
                    </td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.sent}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.open}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.click}</td>
                    <td className="py-4 text-right text-[15px] text-[#102246]">{campaign.reply}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Selected campaign</p>
                <p className="mt-1 text-[14px] text-[#5f6f89]">{selectedCampaign?.name}</p>
                <label className="mt-2 block text-[12px] text-[#6a7790]">
                  Sending mailbox
                  <select
                    value={selectedCampaign?.emailAccountId ?? ""}
                    onChange={handleAssignAccountToCampaign}
                    className="mt-1 block w-full rounded-[10px] border border-[#d6deea] bg-[#f8faff] px-2 py-1.5 text-[13px] text-[#102246] outline-none"
                  >
                    <option value="">Default (global env provider)</option>
                    {emailAccounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={!account.isActive}>
                        {account.label} {account.isActive ? "" : "(inactive)"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <ActionButton
                  label={selectedCampaign?.status === "Sending" ? "Pause automation" : "Resume automation"}
                  icon={selectedCampaign?.status === "Sending" ? FunnelIcon : SendIcon}
                  primary
                  onClick={handleToggleCampaignStatus}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7edf5] px-4 py-3.5">
              <div>
                <p className="text-[15px] font-semibold text-[#102246]">Add leads</p>
                <p className="mt-0.5 text-[13px] text-[#8593ac]">
                  Enrolls into {selectedCampaign?.name ?? "the selected campaign"}'s no-reply cadence via the backend.
                </p>
              </div>
              <div className="flex shrink-0 gap-1 rounded-[10px] bg-[#f0f3f9] p-1">
                <button
                  type="button"
                  onClick={() => setLeadEntryMode("single")}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                    leadEntryMode === "single" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
                  }`}
                >
                  Single lead
                </button>
                <button
                  type="button"
                  onClick={() => setLeadEntryMode("csv")}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition ${
                    leadEntryMode === "csv" ? "bg-white text-[#102246] shadow-[0_1px_4px_rgba(30,48,87,0.12)]" : "text-[#5f6f89]"
                  }`}
                >
                  CSV import
                </button>
              </div>
            </div>

            <div className="px-4 py-4">
              {leadEntryMode === "single" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Name">
                      <input
                        value={newLeadForm.name}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        value={newLeadForm.company}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, company: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        value={newLeadForm.email}
                        onChange={(event) => setNewLeadForm((current) => ({ ...current, email: event.target.value }))}
                        className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[14px] text-[#102246] outline-none focus:border-[#3046b2]"
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <ActionButton label="Add lead" icon={PlusIcon} primary onClick={handleAddLead} />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-5 text-[#6a7790]">
                    Paste rows with a header of <code className="rounded bg-[#f0f3f9] px-1.5 py-0.5 text-[12px]">name,company,email,owner</code> (owner is
                    optional). One bad row won't block the rest of the batch.
                  </p>
                  <textarea
                    rows={5}
                    placeholder={"name,company,email,owner\nDeepa Paul,Nordwind Energy,deepa@nordwind.de,Rahul R"}
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    className="mt-3 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2.5 text-[13px] font-mono text-[#102246] outline-none focus:border-[#3046b2]"
                  />
                  <div className="mt-4">
                    <ActionButton label="Import CSV" icon={UploadIcon} primary onClick={handleImportCsv} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
            <p className="text-[15px] font-semibold text-[#102246]">Sending mailboxes</p>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              Register as many SMTP accounts as you need; assign one to the selected campaign above (or leave it on the default).
            </p>

            {emailAccounts.length > 0 ? (
              <div className="mt-4 space-y-2">
                {emailAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e7edf5] px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#102246]">{account.label}</p>
                      <p className="truncate text-[12px] text-[#6a7790]">
                        {account.fromAddress} · {account.smtpHost} · {account.dailyLimit}/day
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          account.isActive ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                        }`}
                      >
                        {account.isActive ? "Active" : "Inactive"}
                      </span>
                      {account.isActive ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivateAccount(account.id)}
                          className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#9aa6ba]">No mailboxes added yet — add one below.</p>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                placeholder="Label (e.g. Rahul's mailbox)"
                value={newAccountForm.label}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, label: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="From address"
                type="email"
                value={newAccountForm.fromAddress}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, fromAddress: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP host"
                value={newAccountForm.smtpHost}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpHost: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="Port (e.g. 465 or 587)"
                value={newAccountForm.smtpPort}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPort: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP username"
                value={newAccountForm.smtpUser}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpUser: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="SMTP password"
                type="password"
                value={newAccountForm.smtpPass}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpPass: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <input
                placeholder="Daily limit (e.g. 500)"
                value={newAccountForm.dailyLimit}
                onChange={(event) => setNewAccountForm((current) => ({ ...current, dailyLimit: event.target.value }))}
                className="w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[14px] text-[#102246] outline-none"
              />
              <label className="flex items-center gap-2 text-[13px] text-[#5f6f89]">
                <input
                  type="checkbox"
                  checked={newAccountForm.smtpSecure}
                  onChange={(event) => setNewAccountForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
                />
                Use implicit TLS (port 465)
              </label>
            </div>
            <div className="mt-3">
              <ActionButton label="Add mailbox" icon={PlusIcon} primary onClick={handleAddEmailAccount} />
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[16px] font-semibold text-[#102246]">Automation Builder</h2>
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Live</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Campaign name">
              <input
                value={automationForm.campaignName}
                onChange={(event) => handleFormChange("campaignName", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              />
            </Field>
            <Field label="Audience segment">
              <select
                value={automationForm.audience}
                onChange={(event) => handleFormChange("audience", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option>Renewables founders</option>
                <option>Family offices</option>
                <option>Manufacturing buyouts</option>
                <option>MENA infrastructure</option>
              </select>
            </Field>
            <Field label="Primary template">
              <select
                value={automationForm.template}
                onChange={(event) => handleFormChange("template", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option>Cold intro — Renewables founder</option>
                <option>Follow-up — Sector teaser</option>
                <option>Portfolio quarterly update</option>
              </select>
            </Field>
            <Field label="Daily sending cap">
              <input
                type="number"
                value={automationForm.dailyLimit}
                onChange={(event) => handleFormChange("dailyLimit", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              />
            </Field>
            <Field label="Delay between steps">
              <select
                value={automationForm.delayDays}
                onChange={(event) => handleFormChange("delayDays", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="2">2 days</option>
                <option value="3">3 days</option>
                <option value="5">5 days</option>
                <option value="7">7 days</option>
              </select>
            </Field>
            <Field label="Follow-up count">
              <select
                value={automationForm.followUpCount}
                onChange={(event) => handleFormChange("followUpCount", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="2">2 follow-ups</option>
                <option value="3">3 follow-ups</option>
                <option value="4">4 follow-ups</option>
              </select>
            </Field>
            <Field label="When lead replies">
              <select
                value={automationForm.replyType}
                onChange={(event) => handleFormChange("replyType", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="interested">Interested reply</option>
                <option value="info-request">Asked for more info</option>
                <option value="zoom-request">Wants Zoom first</option>
                <option value="no-reply">No reply</option>
              </select>
            </Field>
            <Field label="Preferred progression">
              <select
                value={automationForm.preferredPath}
                onChange={(event) => handleFormChange("preferredPath", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none"
              >
                <option value="nda-first">NDA first, then Zoom</option>
                <option value="zoom-first">Zoom first, then NDA</option>
              </select>
            </Field>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ToggleCard
              title="A/B subject testing"
              desc="Split first-touch subject line across two variants."
              checked={automationForm.abTest}
              onChange={() => handleFormChange("abTest", !automationForm.abTest)}
            />
            <ToggleCard
              title="Auto-pause on reply"
              desc="Stop the sequence as soon as a lead replies."
              checked={automationForm.autoPause}
              onChange={() => handleFormChange("autoPause", !automationForm.autoPause)}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton label="Save automation" icon={SendIcon} primary onClick={handleSaveAutomation} />
          </div>

          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Automation status</p>
            <p className="mt-2 text-[15px] font-medium text-[#102246]">{automationNotice}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadsPage({ mailing }) {
  const {
    repliedLeads, selectedLeadId, selectedLead, selectedLeadTimeline, loadLeadIntoWorkflow,
    automationForm, activeReplyRule, handleApplyRule, replyAction, handleTemplateDraftChange,
    handleSendNextEmail, handleSaveTemplate, handlePreviewTemplate, previewHtml, setPreviewHtml,
    simulateIncomingReply, liveSteps, workflowSteps
  } = mailing;

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[#102246]">Bulk to workflow handoff</p>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              {repliedLeads.length} companies replied after the bulk campaign and are now eligible for automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              {repliedLeads.filter((lead) => lead.movedToWorkflow).length} in workflow
            </span>
            <ActionButton label="Simulate reply" icon={UsersIcon} onClick={simulateIncomingReply} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="border-b border-[#e7edf5] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[16px] font-semibold text-[#102246]">Replied leads</h2>
              <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
                From bulk campaigns
              </span>
            </div>
          </div>

          <div>
            {repliedLeads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => loadLeadIntoWorkflow(lead)}
                className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                  selectedLeadId === lead.id ? "bg-[#f5f8fd]" : ""
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eef1ff] text-[13px] font-semibold text-[#4766cc]">
                  {lead.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold text-[#102246]">{lead.name}</p>
                    <span className="text-[12px] text-[#6a7790]">{lead.lastReplyAt}</span>
                  </div>
                  <p className="mt-1 text-[14px] text-[#435471]">{lead.company}</p>
                  <p className="mt-2 truncate text-[14px] text-[#5f6f89]">{lead.replyPreview}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[lead.replyType === "interested" ? "green" : lead.replyType === "zoom-request" ? "indigo" : "amber"]}`}>
                      {lead.replyType}
                    </span>
                    <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-semibold text-[#4766cc]">
                      {lead.stage}
                    </span>
                    <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">
                      {lead.campaign}
                    </span>
                    {lead.bounced ? (
                      <span className="rounded-full bg-[#ffe4ee] px-2.5 py-1 text-[11px] font-semibold text-[#ef5b8f]">
                        Bounced
                      </span>
                    ) : null}
                    {lead.unsubscribed ? (
                      <span className="rounded-full bg-[#edf2f7] px-2.5 py-1 text-[11px] font-semibold text-[#748096]">
                        Unsubscribed
                      </span>
                    ) : null}
                    {lead.callStatus ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          callStatusToneClass[lead.callStatus]
                        }`}
                      >
                        Call {lead.callStatus}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#102246]">Next automated email</h2>
              <p className="mt-1 text-[14px] text-[#5f6f89]">
                Reply-based follow-up for {selectedLead?.name} at {selectedLead?.company}
              </p>
            </div>
            <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">
              Owner {selectedLead?.owner}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Detected reply</p>
              <p className="mt-3 text-[15px] font-medium text-[#102246]">{selectedLead?.replyPreview}</p>
              <div className="mt-4 space-y-2 text-[14px] text-[#435471]">
                <p>Campaign: <span className="font-medium text-[#102246]">{selectedLead?.campaign}</span></p>
                <p>Reply class: <span className="font-medium text-[#102246]">{automationForm.replyType}</span></p>
                <p>Flow path: <span className="font-medium text-[#102246]">{automationForm.preferredPath}</span></p>
                <p>CRM stage: <span className="font-medium text-[#102246]">{selectedLead?.stage}</span></p>
              </div>

              <p className="mt-4 text-[12px] text-[#6a7790]">
                Auto-classified from reply text — click a rule to override manually.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {replyRules.map((rule) => {
                  const active = activeReplyRule?.id === rule.id;
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => handleApplyRule(rule)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                        active
                          ? "bg-[#dff5e7] text-[#2b9b60] ring-1 ring-inset ring-[#2b9b60]"
                          : "bg-[#edf2f7] text-[#5f6f89] hover:bg-[#e3e9f2]"
                      }`}
                    >
                      {rule.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">Email draft</p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Subject</p>
                  <input
                    value={replyAction.subject}
                    onChange={(event) => handleTemplateDraftChange("subject", event.target.value)}
                    className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-2 text-[15px] font-medium text-[#102246] outline-none"
                  />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-[0.12em] text-[#6a7790]">Body</p>
                  <textarea
                    value={replyAction.body}
                    onChange={(event) => handleTemplateDraftChange("body", event.target.value)}
                    rows={6}
                    className="mt-1 w-full rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-3 py-3 text-[14px] leading-6 text-[#435471] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton label={replyAction.cta} icon={MailIcon} primary onClick={handleSendNextEmail} />
            <ActionButton label="Save template" icon={TagIcon} onClick={handleSaveTemplate} />
            <ActionButton label="Preview" icon={SearchIcon} onClick={handlePreviewTemplate} />
          </div>

          {previewHtml ? (
            <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">
                  Preview — rendered with sample data, exactly as a real send would look
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewHtml(null)}
                  className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]"
                >
                  Close
                </button>
              </div>
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                className="mt-3 h-[420px] w-full rounded-[12px] border border-[#d6deea]"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <SendIcon className="size-5 text-[#21439b]" />
              <h2 className="text-[16px] font-semibold text-[#102246]">Planned sequence</h2>
            </div>
            <span className="text-[14px] text-[#5f6f89]">{liveSteps.length} touches</span>
          </div>
          <p className="mt-2 text-[13px] text-[#8593ac]">
            Preview of the cadence steps "Save automation" will schedule, based on the delay/follow-up settings above.
          </p>
          <div className="mt-6 space-y-4">
            {liveSteps.map((step) => (
              <div key={step.title}>
                <p className="text-[15px] font-semibold text-[#102246]">{step.title}</p>
                <p className="text-[14px] text-[#5f6f89]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
          <h2 className="text-[16px] font-semibold text-[#102246]">Sequence summary</h2>
          <div className="mt-5 space-y-3 text-[14px] text-[#435471]">
            <p>Audience: <span className="font-medium text-[#102246]">{automationForm.audience}</span></p>
            <p>Template: <span className="font-medium text-[#102246]">{automationForm.template}</span></p>
            <p>Cadence gap: <span className="font-medium text-[#102246]">{automationForm.delayDays} days</span></p>
            <p>Daily cap: <span className="font-medium text-[#102246]">{automationForm.dailyLimit}/day</span></p>
            <p>A/B test: <span className="font-medium text-[#102246]">{automationForm.abTest ? "Enabled" : "Disabled"}</span></p>
            <p>Reply branch: <span className="font-medium text-[#102246]">{automationForm.replyType}</span></p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#102246]">Lead activity timeline</h2>
            <p className="mt-1 text-[14px] text-[#5f6f89]">
              Bulk campaign touchpoints and follow-up automation for {selectedLead?.name}
            </p>
          </div>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
            {selectedLeadTimeline.length} events
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {selectedLeadTimeline.map((event, index) => (
            <div key={`${event.at}-${event.title}-${index}`} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-3 w-3 rounded-full bg-[#3046b2]" />
                {index !== selectedLeadTimeline.length - 1 ? <span className="mt-2 h-full w-px bg-[#d9e2ef]" /> : null}
              </div>
              <div className="min-w-0 flex-1 rounded-[18px] border border-[#d6deea] bg-[#f8faff] px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-[#102246]">{event.title}</p>
                  <span className="text-[12px] text-[#6a7790]">{event.at}</span>
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[#435471]">{event.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">Reply-triggered workflow</h2>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">
            {automationForm.replyType === "no-reply" ? "Reminder path" : "Conditional path"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflowSteps.map((step) => (
            <div
              key={step.key}
              className={`rounded-[18px] border px-4 py-4 ${
                step.state === "done"
                  ? "border-[#cce7d6] bg-[#f1fbf5]"
                  : step.state === "current"
                    ? "border-[#bfd0ff] bg-[#f4f7ff]"
                    : "border-[#d6deea] bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[15px] font-semibold text-[#102246]">{step.title}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    step.state === "done"
                      ? "bg-[#dff5e7] text-[#2b9b60]"
                      : step.state === "current"
                        ? "bg-[#e6ebff] text-[#5769d4]"
                        : "bg-[#edf2f7] text-[#748096]"
                  }`}
                >
                  {step.state}
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-[#5f6f89]">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsappBusinessPage() {
  const page = whatsappBusinessData;
  return (
    <section className="grid gap-4 xl:grid-cols-[300px_1fr_260px]">
      <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">Conversations</h2>
        </div>
        <div>
          {page.conversations.map(([initials, name, preview, time, badge], index) => (
            <button
              key={name}
              type="button"
              className={`flex w-full items-start gap-3 border-b border-[#e7edf5] px-5 py-4 text-left transition hover:bg-[#f8faff] ${
                index === 0 ? "bg-[#f5f8fd]" : ""
              }`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dff5e7] text-[13px] font-semibold text-[#2a9c60]">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[15px] font-semibold text-[#102246]">{name}</p>
                  <span className="text-[12px] text-[#6a7790]">{time}</span>
                </div>
                <p className="mt-1 truncate text-[14px] text-[#5f6f89]">{preview}</p>
              </div>
              {badge ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#2fa84f] px-1 text-[11px] font-semibold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="border-b border-[#e7edf5] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-full bg-[#e6f6eb] text-[#2b9b60]">
              <span className="size-3 rounded-full border-2 border-current" />
            </div>
            <div>
              <p className="text-[18px] font-semibold text-[#102246]">Deepa Paul</p>
              <p className="text-[14px] text-[#5f6f89]">Nordwind Energy · +49 151 4432 1180</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {page.messages.map(([side, text, time]) => (
            <div key={`${time}-${text}`} className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-[18px] px-4 py-3 text-[15px] leading-6 shadow-sm ${
                  side === "right" ? "bg-[#dff1e4] text-[#102246]" : "bg-[#edf1f7] text-[#102246]"
                }`}
              >
                <p>{text}</p>
                <p className="mt-2 text-right text-[12px] text-[#6a7790]">{time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#e7edf5] px-4 py-3">
          <div className="flex items-center gap-3 rounded-full border border-[#d6deea] bg-[#f7f9fc] px-4 py-3">
            <input
              type="text"
              placeholder="Reply within the 24h service window..."
              className="w-full bg-transparent text-[15px] text-[#102246] outline-none placeholder:text-[#7e8aa1]"
            />
            <button type="button" className="grid size-10 place-items-center rounded-full bg-[#3046b2] text-white">
              <SendIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <h2 className="text-[16px] font-semibold text-[#102246]">Message templates</h2>
        <div className="mt-5 space-y-3">
          {page.templates.map(([name, status, tone]) => (
            <div key={name} className="rounded-[18px] border border-[#d6deea] px-4 py-4">
              <p className="text-[15px] font-semibold text-[#102246]">{name}</p>
              <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${noteToneClass[tone]}`}>{status}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[14px] leading-6 text-[#5f6f89]">
          Broadcasts respect opt-out preferences and are written back to the CRM timeline.
        </p>
      </div>
    </section>
  );
}

const signalStatusToneClass = {
  PENDING: "bg-[#edf2f7] text-[#748096]",
  PROCESSED: "bg-[#dff5e7] text-[#2b9b60]",
  DUPLICATE: "bg-[#edf2f7] text-[#748096]",
  IGNORED: "bg-[#fff4e7] text-[#f29b3a]",
  FAILED: "bg-[#ffe4ee] text-[#ef5b8f]"
};

const signalSourceLabel = {
  GOOGLE_NEWS: "Google News",
  NEWSAPI: "NewsAPI.ai",
  EXA: "Exa Search",
  FIRECRAWL: "Firecrawl"
};

function MarketIntelligencePage() {
  const [status, setStatus] = useState(null);
  const [signals, setSignals] = useState([]);
  const [notice, setNotice] = useState("Checking backend connectivity…");
  const [running, setRunning] = useState(false);

  const loadStatusAndSignals = () => {
    fetchMarketIntelligenceStatus()
      .then((result) => {
        setStatus(result);
        setNotice((current) => (current === "Checking backend connectivity…" ? "Connected to the backend." : current));
      })
      .catch((error) => {
        setStatus(null);
        setNotice(`Backend unreachable (${error.message}) — this page needs the API running to show anything real.`);
      });

    fetchMarketSignals()
      .then((result) => setSignals(result))
      .catch(() => {
        // Keep whatever signals are already shown (likely none) — the
        // status fetch above already surfaces the connectivity problem.
      });
  };

  useEffect(() => {
    loadStatusAndSignals();
  }, []);

  async function handleRunPipeline() {
    setRunning(true);
    try {
      const summary = await runMarketIntelligencePipeline({});
      if (summary.skippedSources?.length === 5 || (status && Object.values(status).every((v) => !v))) {
        setNotice(
          `Ran, but every source is unconfigured — nothing to fetch. Skipped: ${summary.skippedSources?.join(", ") ?? "all"}.`
        );
      } else {
        setNotice(
          `Run complete — fetched ${summary.fetched}, ${summary.duplicates} duplicate(s), ${summary.matched} matched to existing leads, ${summary.created} new lead(s) created, ${summary.ignored} ignored, ${summary.failed} failed.`
        );
      }
      loadStatusAndSignals();
    } catch (error) {
      setNotice(`Run failed via the backend (${error.message}).`);
    } finally {
      setRunning(false);
    }
  }

  const services = status
    ? [
        { key: "googleNews", label: "Google News RSS" },
        { key: "newsApi", label: "NewsAPI.ai" },
        { key: "exa", label: "Exa Search" },
        { key: "firecrawl", label: "Firecrawl" },
        { key: "apollo", label: "Apollo" },
        { key: "aiProcessor", label: "AI processing (Claude)" }
      ]
    : [];

  return (
    <section className="space-y-6">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <RadarIcon className="size-5 text-[#8853d0]" />
            <h2 className="text-[16px] font-semibold text-[#102246]">Source connections</h2>
          </div>
          <ActionButton label={running ? "Running…" : "Run pipeline now"} icon={SendIcon} primary onClick={handleRunPipeline} />
        </div>

        {status ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {services.map((service) => (
              <div key={service.key} className="rounded-[14px] border border-[#e7edf5] px-3 py-3">
                <p className="text-[13px] font-medium text-[#102246]">{service.label}</p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    status[service.key] ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
                  }`}
                >
                  {status[service.key] ? "Connected" : "Not configured"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[#9aa6ba]">No status available — backend unreachable.</p>
        )}

        <div className="mt-5 rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3">
          <p className="text-[13px] text-[#5f6f89]">{notice}</p>
        </div>
      </div>

      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[16px] font-semibold text-[#102246]">Captured signals</h2>
          <span className="rounded-full bg-[#edf2f7] px-3 py-1 text-[12px] font-semibold text-[#5f6f89]">{signals.length}</span>
        </div>

        {signals.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.12em] text-[#60708b]">
                  <th className="pb-3 font-medium">Headline</th>
                  <th className="pb-3 font-medium">Published</th>
                  <th className="pb-3 font-medium">Signal type</th>
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 text-right font-medium">Relevance</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => (
                  <tr key={signal.id} className="border-t border-[#e7edf5]">
                    <td className="max-w-[320px] py-4 text-[15px] font-medium text-[#102246]">
                      {signal.sourceUrl ? (
                        <a
                          href={signal.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 hover:text-[#3046b2] hover:underline"
                        >
                          {signal.entityName ?? signal.rawTitle}
                        </a>
                      ) : (
                        <span className="line-clamp-2">{signal.entityName ?? signal.rawTitle}</span>
                      )}
                    </td>
                    <td className="py-4 text-[13px] whitespace-nowrap text-[#8593ac]">
                      {signal.rawPublishedAt ? new Date(signal.rawPublishedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-4 text-[14px] text-[#435471]">{signal.signalType ?? "—"}</td>
                    <td className="py-4 text-[14px] text-[#435471]">{signalSourceLabel[signal.source] ?? signal.source}</td>
                    <td className="py-4 text-right text-[14px] text-[#102246]">{signal.relevanceScore ?? "—"}</td>
                    <td className="py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${signalStatusToneClass[signal.status]}`}>
                        {signal.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[#9aa6ba]">
            No signals captured yet — either the backend's unreachable, or every source is unconfigured (see above).
          </p>
        )}
      </div>
    </section>
  );
}

// The auto-responder maps a classified reply straight to one of these 4
// keys (see server/src/lib/autoRespond.js) — deleting one would silently
// break auto-sending for that reply type, so the backend refuses (409) and
// this mirrors that same set client-side to hide the Delete button for them
// before the user hits that error at all.
const PROTECTED_TEMPLATE_KEYS = new Set(["interested", "zoom-request", "info-request", "no-reply"]);
const BLANK_TEMPLATE_FORM = { key: "", subject: "", body: "" };

function TemplatesCadencesPage() {
  // Real backend Template rows only — no fabricated fallback rows and no
  // decorative "Cadences" panel (cadence steps are per-campaign, shown for
  // real on the Cold Bulk Mailing page's "Planned sequence" panel; there's
  // no single flat "all cadences" list to show here).
  const [backendTemplates, setBackendTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(BLANK_TEMPLATE_FORM);
  // null = creating a brand-new template (key is editable); a string = the
  // key of the template currently loaded into the form for editing (key
  // field is locked — PUT upserts by key, so changing it here would edit a
  // different row than the one the user clicked).
  const [editingKey, setEditingKey] = useState(null);
  const [notice, setNotice] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);

  function loadTemplates() {
    fetchTemplates()
      .then((templates) => {
        setBackendTemplates(templates);
        setLoadError(null);
      })
      .catch((error) => setLoadError(error.message));
  }

  useEffect(loadTemplates, []);

  function handleFormChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleNewTemplate() {
    setEditingKey(null);
    setForm(BLANK_TEMPLATE_FORM);
    setPreviewHtml(null);
    setNotice(null);
  }

  function handleEditTemplate(template) {
    setEditingKey(template.key);
    setForm({ key: template.key, subject: template.subject, body: template.body });
    setPreviewHtml(null);
    setNotice(null);
  }

  async function handleSaveTemplate() {
    const key = editingKey ?? form.key.trim();
    if (!key || !form.subject.trim() || !form.body.trim()) {
      setNotice("Fill in a key, subject, and body before saving.");
      return;
    }
    try {
      await saveTemplate(key, { subject: form.subject, body: form.body });
      setNotice(`Template "${key}" saved to the backend.`);
      setEditingKey(key);
      setForm((current) => ({ ...current, key }));
      loadTemplates();
    } catch (error) {
      setNotice(`Could not save "${key}" — backend unreachable (${error.message}).`);
    }
  }

  async function handleDeleteTemplate(key) {
    try {
      await deleteTemplate(key);
      setNotice(`Template "${key}" deleted.`);
      if (editingKey === key) {
        handleNewTemplate();
      }
      loadTemplates();
    } catch (error) {
      setNotice(`Could not delete "${key}" (${error.message}).`);
    }
  }

  async function handlePreviewTemplate(key) {
    try {
      const rendered = await fetchTemplatePreview(key);
      setPreviewHtml(rendered.html);
    } catch (error) {
      setPreviewHtml(null);
      setNotice(`Could not load a preview for "${key}" (${error.message}). Save it first — preview renders the saved version.`);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[22px] border border-[#d6deea] bg-white px-5 py-5 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <NoteIcon className="size-5 text-[#ff9e1a]" />
            <h2 className="text-[16px] font-semibold text-[#102246]">Template library</h2>
          </div>
          <div className="flex items-center gap-3">
            {backendTemplates ? (
              <span className="rounded-full bg-[#dff5e7] px-3 py-1 text-[12px] font-semibold text-[#2b9b60]">Live from backend</span>
            ) : null}
            <ActionButton label="New template" icon={PlusIcon} primary onClick={handleNewTemplate} />
          </div>
        </div>

        {backendTemplates ? (
          <div className="mt-5 space-y-2.5">
            {backendTemplates.map((template) => {
              const isSelected = editingKey === template.key;
              return (
                <div
                  key={template.key}
                  className={`flex items-center justify-between gap-4 rounded-[16px] border px-4 py-3.5 transition ${
                    isSelected ? "border-[#3046b2] bg-[#f2f5ff] shadow-[0_2px_10px_rgba(48,70,178,0.08)]" : "border-[#e7edf5] bg-white hover:border-[#c6d2e6]"
                  }`}
                >
                  <button type="button" onClick={() => handleEditTemplate(template)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-[#102246]">{template.subject}</p>
                      <span className="shrink-0 rounded-full bg-[#edf2f7] px-2 py-0.5 text-[11px] font-semibold text-[#5f6f89]">{template.key}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-[#8593ac]">
                      {template.html ? "Custom HTML" : "Auto-generated HTML"} · Updated {new Date(template.updatedAt).toLocaleDateString()}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => handleEditTemplate(template)}
                      className="grid size-8 place-items-center rounded-[10px] text-[#5f6f89] transition hover:bg-[#eef1ff] hover:text-[#3046b2]"
                    >
                      <PencilIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Preview"
                      aria-label="Preview"
                      onClick={() => handlePreviewTemplate(template.key)}
                      className="grid size-8 place-items-center rounded-[10px] text-[#5f6f89] transition hover:bg-[#eef1ff] hover:text-[#3046b2]"
                    >
                      <SearchIcon className="size-4" />
                    </button>
                    {PROTECTED_TEMPLATE_KEYS.has(template.key) ? (
                      <span
                        title="Used by the auto-responder — can't be deleted"
                        aria-label="Delete unavailable — used by the auto-responder"
                        className="grid size-8 place-items-center text-[#c7cedb]"
                      >
                        <TagIcon className="size-4" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => handleDeleteTemplate(template.key)}
                        className="grid size-8 place-items-center rounded-[10px] text-[#c94b6b] transition hover:bg-[#fdecf1] hover:text-[#a13a56]"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-[#9aa6ba]">
            {loadError ? `Backend unreachable (${loadError}) — this page needs the API running to show anything real.` : "Loading…"}
          </p>
        )}

        {previewHtml ? (
          <div className="mt-5 rounded-[18px] border border-[#d6deea] bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#5f6f89]">
                Preview — rendered with sample data, exactly as a real send would look
              </p>
              <button type="button" onClick={() => setPreviewHtml(null)} className="text-[12px] font-semibold text-[#5f6f89] hover:text-[#102246]">
                Close
              </button>
            </div>
            <iframe title="Template preview" srcDoc={previewHtml} sandbox="" className="mt-3 h-[360px] w-full rounded-[12px] border border-[#d6deea]" />
          </div>
        ) : null}
      </div>

      <div className="h-fit rounded-[22px] border border-[#d6deea] bg-white shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
        <div className="flex items-center gap-3 border-b border-[#e7edf5] px-5 py-4">
          <span className={`grid size-9 shrink-0 place-items-center rounded-full ${editingKey ? "bg-[#eef1ff] text-[#3046b2]" : "bg-[#dff5e7] text-[#2b9b60]"}`}>
            {editingKey ? <PencilIcon className="size-4" /> : <PlusIcon className="size-4" />}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold text-[#102246]">{editingKey ? `Editing "${editingKey}"` : "New template"}</h2>
            <p className="mt-0.5 text-[12px] text-[#8593ac]">
              {editingKey ? "Saving upserts this key on the backend." : "Creates a new Template row."}
            </p>
          </div>
        </div>

        <div className="px-5 py-5">
          {!editingKey ? (
            <p className="mb-4 rounded-[12px] bg-[#f8faff] px-3 py-2.5 text-[12px] leading-5 text-[#5f6f89]">
              Reply-type auto-sends only look for these 4 keys: <span className="font-semibold text-[#102246]">{[...PROTECTED_TEMPLATE_KEYS].join(", ")}</span>. A
              custom key won't be auto-sent unless code elsewhere references it.
            </p>
          ) : null}

          <div className="space-y-4">
            <Field label="Key">
              <input
                value={editingKey ?? form.key}
                onChange={(event) => handleFormChange("key", event.target.value)}
                disabled={Boolean(editingKey)}
                placeholder="e.g. holiday-follow-up"
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none focus:border-[#3046b2] disabled:text-[#9aa6ba]"
              />
            </Field>
            <Field label="Subject">
              <input
                value={form.subject}
                onChange={(event) => handleFormChange("subject", event.target.value)}
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[15px] text-[#102246] outline-none focus:border-[#3046b2]"
              />
            </Field>
            <Field label="Body">
              <textarea
                value={form.body}
                onChange={(event) => handleFormChange("body", event.target.value)}
                rows={8}
                placeholder="Merge fields: {{leadName}}, {{company}}, {{unsubscribeUrl}}, {{ndaSignUrl}}"
                className="w-full rounded-[14px] border border-[#d6deea] bg-[#f8faff] px-4 py-3 text-[14px] leading-6 text-[#435471] outline-none focus:border-[#3046b2]"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-[#e7edf5] pt-5">
            <ActionButton label={editingKey ? "Save changes" : "Create template"} icon={TagIcon} primary onClick={handleSaveTemplate} />
            {editingKey ? <ActionButton label="New template" icon={PlusIcon} onClick={handleNewTemplate} /> : null}
          </div>

          {notice ? (
            <div className="mt-4 rounded-[12px] border border-[#d6deea] bg-[#f8faff] px-4 py-3">
              <p className="text-[13px] font-medium leading-5 text-[#102246]">{notice}</p>
            </div>
          ) : null}
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

function Field({ label, children }) {
  return (
    <label className="block">
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f6f89]">{label}</p>
      {children}
    </label>
  );
}

function ToggleCard({ title, desc, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-[18px] border px-4 py-4 text-left transition ${
        checked ? "border-[#b8d1ff] bg-[#f2f6ff]" : "border-[#d6deea] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[15px] font-semibold text-[#102246]">{title}</p>
          <p className="mt-1 text-[14px] leading-6 text-[#5f6f89]">{desc}</p>
        </div>
        <span
          className={`mt-1 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
            checked ? "bg-[#dff5e7] text-[#2b9b60]" : "bg-[#edf2f7] text-[#748096]"
          }`}
        >
          {checked ? "On" : "Off"}
        </span>
      </div>
    </button>
  );
}

function StatCard({ card }) {
  return (
    <div className="rounded-[20px] border border-[#d6deea] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(30,48,87,0.06)]">
      <p className="text-[12px] uppercase tracking-[0.2em] text-[#5c6b87]">{card.label}</p>
      <p className="mt-3 text-[2.2rem] font-semibold leading-none tracking-[-0.04em] text-[#0f2042]">{card.value}</p>
      <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${noteToneClass[card.noteTone]}`}>
        {card.note}
      </span>
    </div>
  );
}

function ActionButton({ label, icon: Icon, primary, external, hero, onClick }) {
  if (hero) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-[14px] px-5 py-3 text-[15px] font-semibold ${
          primary ? "bg-white text-[#21439b]" : "border border-white/35 bg-white/6 text-white"
        }`}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {label}
        {external ? <span className="text-lg">↗</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-[15px] font-semibold shadow-[0_2px_8px_rgba(30,48,87,0.04)] ${
        primary
          ? "border-[#3046b2] bg-[#3046b2] text-white"
          : "border-[#d6deea] bg-white text-[#102246]"
      }`}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {label}
    </button>
  );
}

export default App;
