export const navSections = [
  {
    title: "Intelligence",
    items: [
      { id: "command-center", label: "Command Center", icon: "grid" },
      { id: "market-intelligence", label: "Market Intelligence", icon: "radar", badge: "AI" },
      { id: "lead-discovery", label: "Lead Discovery", icon: "sparkles", badge: "AI" },
      { id: "leads", label: "Leads", icon: "users" },
      { id: "qualification", label: "Qualification", icon: "funnel", badge: "AI" }
    ]
  },
  {
    title: "CRM & Outreach",
    items: [
      { id: "crm-workspace", label: "CRM Workspace", icon: "users" },
      { id: "cold-bulk-mailing", label: "Cold Bulk Mailing", icon: "mailbox" },
      { id: "whatsapp-business", label: "WhatsApp Business", icon: "message" },
      { id: "telephony-sms", label: "Telephony & SMS", icon: "phone" },
      { id: "templates-cadences", label: "Templates & Cadences", icon: "send" }
    ]
  },
  {
    title: "Relationships",
    items: [
      { id: "companies", label: "Companies", icon: "building" },
      { id: "contacts", label: "Contacts", icon: "contact" },
      { id: "communications", label: "Communications", icon: "chat" },
      { id: "meetings", label: "Meetings", icon: "calendar" }
    ]
  },
  {
    title: "Deal Execution",
    items: [
      { id: "pipeline", label: "Pipeline", icon: "pipeline" },
      { id: "deals", label: "Deals", icon: "briefcase" }
    ]
  }
];

export const topBarMeta = {
  location: "Amsterdam",
  cycle: "FY26",
  initials: "GC"
};

export const marketIntelligenceData = {
  badge: "Module",
  title: "Market Intelligence",
  description:
    "Scans news, the open web, and press pages for funding/acquisition/expansion signals, then matches them to existing deals or sources a new one via Apollo."
};

export const commandCenterData = {
  badge: "AI-POWERED FUNDING & INVESTMENT OS",
  title: "Command Center",
  description:
    "From opportunity discovery to funding and portfolio monitoring — the system manages the process so the team can manage the deal.",
  stats: [
    { label: "Pipeline Value", value: "€2.35B", note: "+8.4% QoQ", noteTone: "blue" },
    { label: "Live Opportunities", value: "250", note: "24 in diligence", noteTone: "cyan" },
    { label: "Capital Deployed", value: "€412M", note: "34 companies", noteTone: "green" },
    { label: "Portfolio MOIC", value: "2.1x", note: "+0.2x YoY", noteTone: "amber" }
  ],
  stages: [
    { stage: "Discovery", count: "148", value: "€980M", width: "100%", tone: "cyan" },
    { stage: "Qualification", count: "62", value: "€610M", width: "42%", tone: "violet" },
    { stage: "Due Diligence", count: "24", value: "€410M", width: "16%", tone: "amber" },
    { stage: "Term Sheet", count: "11", value: "€230M", width: "8%", tone: "teal" },
    { stage: "Funding", count: "5", value: "€118M", width: "8%", tone: "green" }
  ],
  priorities: [
    { title: "Investment Committee pack — Helios Grid", due: "Due today", tone: "pink" },
    { title: "Site visit report — Meridian Logistics", due: "Due in 2 days", tone: "amber" },
    { title: "Valuation refresh — Kestrel Bio", due: "Due in 4 days", tone: "blue" },
    { title: "Quarterly covenant review — 6 companies", due: "Due in 6 days", tone: "teal" }
  ]
};

export const crmWorkspaceData = {
  badge: "Module",
  title: "CRM Workspace",
  description:
    "Zoho-style enquiry management: records, related lists, timelines and one-click outreach across email, WhatsApp and phone.",
  stats: [
    { label: "Total records", value: "55", note: "+9 this week", noteTone: "blue" },
    { label: "Unassigned", value: "6", note: "Assignment rules", noteTone: "amber" },
    { label: "Converted", value: "9.4%", note: "Lead → deal", noteTone: "green" },
    { label: "Avg response", value: "2h 14m", note: "First touch", noteTone: "cyan" }
  ],
  enquiries: [
    { initials: "BN", name: "Bhakthi Nair", company: "Helio Grid BV", ask: "€4.5M Series A", status: "New", tone: "blue" },
    { initials: "DP", name: "Deepa Paul", company: "Nordwind Energy", ask: "€12M Growth", status: "Negotiation", tone: "amber", active: true },
    { initials: "HP", name: "Harsha Pillai", company: "Agrivolt SA", ask: "€8M Bridge", status: "Qualified", tone: "green" },
    { initials: "ND", name: "Nitin Das", company: "PortLogic Rotterdam", ask: "€2.2M Seed", status: "Contacted", tone: "violet" },
    { initials: "RK", name: "Ritu Kapoor", company: "CircuLoop Materials", ask: "€6M Series A", status: "New", tone: "sky" }
  ],
  lead: {
    initials: "DP",
    name: "Deepa Paul",
    company: "Nordwind Energy",
    owner: "Rahul R"
  },
  overview: [
    ["Lead Owner", "Rahul R"],
    ["Legal Entity Name", "Nordwind Energy"],
    ["Email", "deepa.paul@nordwind.de"],
    ["Mobile", "+49 151 4432 1180"],
    ["Lead Source", "Referral"],
    ["Lead Status", "Negotiation"],
    ["Capital Ask", "€12M Growth"],
    ["Territory", "Benelux / DACH"],
    ["Engagement Stage", "Mandate fit review"],
    ["Consent (GDPR)", "Opted in — 03 Aug 2026"]
  ],
  related: [
    ["Notes", 2],
    ["Attachments", 5],
    ["Emails", 9],
    ["Calls", 3],
    ["Meetings", 2],
    ["Cadences", 1]
  ]
};

export const coldBulkMailingData = {
  title: "Cold Bulk Mailing",
  // No top-level stats card here (deliberately) — those numbers used to be
  // fabricated ("12,480 sent", "58.4% open") and never reflected anything
  // real. The real per-campaign sent/open/click/reply numbers are in the
  // Campaigns table below, sourced from the backend's ActivityLog
  // aggregation (see GET /campaigns' engagement field) once reachable.
  campaigns: [
    ["Q3 Renewables Founders — Benelux", "Sending", "1840", "61%", "18%", "7%"],
    ["Family Office Co-Invest Outreach", "Scheduled", "0", "0%", "0%", "0%"],
    ["Manufacturing Buyout Teaser", "Completed", "2960", "54%", "14%", "5%"],
    ["MENA Infrastructure Intro Sequence", "Draft", "0", "0%", "0%", "0%"]
  ],
  cadenceSteps: [
    ["Day 0 · Intro email", "Mandate fit + one-line credibility proof", "100% engaged", "100%"],
    ["Day 3 · Value follow-up", "Sector teaser PDF attached", "72% engaged", "72%"],
    ["Day 7 · Case study", "Comparable transaction snapshot", "48% engaged", "48%"]
  ]
};

export const whatsappBusinessData = {
  badge: "Module",
  title: "WhatsApp Business",
  description:
    "Two-way WhatsApp messaging with approved templates, broadcast campaigns and every conversation logged against the lead record.",
  stats: [
    { label: "Active Conversations", value: "87", note: "24h window", noteTone: "green" },
    { label: "Template Messages", value: "1,240", note: "30 days", noteTone: "cyan" },
    { label: "Read Rate", value: "94%", note: "+11pts vs email", noteTone: "blue" },
    { label: "Reply Rate", value: "38%", note: "Median 12m", noteTone: "indigo" }
  ],
  conversations: [
    ["DP", "Deepa Paul", "Sharing the FY26 numbers tonight.", "2m", "2"],
    ["HP", "Harsha Pillai", "Can we move the call to Thursday?", "1h", ""],
    ["ND", "Nitin Das", "Deck received, thank you.", "4h", ""],
    ["RK", "Ritu Kapoor", "Who signs the NDA on your side?", "1d", "1"]
  ],
 messages: [
    ["left", "Hi Vijay — we received the teaser, looks aligned.", "09:32"],
    ["right", "Great. Shall I send the NDA so we can open the data room?", "09:35"],
    ["left", "Yes please, to deepa.paul@nordwind.de", "09:36"],
    ["right", "Sent via the NDA module — signature link valid 7 days.", "09:41"],
    ["left", "Sharing the FY26 numbers tonight.", "10:04"]
  ],
  templates: [
    ["intro_investment_mandate", "Approved", "green"],
    ["nda_signature_reminder", "Approved", "green"],
    ["meeting_confirmation", "Approved", "green"],
    ["quarterly_portfolio_update", "In review", "amber"]
  ]
};

export const templatesCadencesData = {
  title: "Templates & Cadences"
};
