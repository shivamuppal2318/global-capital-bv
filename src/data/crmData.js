// Only modules that are actually built out are listed. Lead Discovery,
// Qualification, Telephony & SMS, Companies, Contacts, Communications and
// Deals were placeholder entries that rendered an empty page, so they're
// removed rather than shipped as dead links. Keep this in step with
// server/src/lib/permissions.js — the ids there drive both the Admin Panel
// checkboxes and the API's own access checks.
export const navSections = [
  {
    title: "Intelligence",
    items: [
      { id: "command-center", label: "Command Center", icon: "grid" },
      { id: "market-intelligence", label: "Market Intelligence", icon: "radar", badge: "AI" },
      { id: "leads", label: "Leads", icon: "users" }
    ]
  },
  {
    title: "CRM & Outreach",
    items: [
      { id: "crm-workspace", label: "CRM Workspace", icon: "users" },
      { id: "cold-bulk-mailing", label: "Cold Bulk Mailing", icon: "mailbox" },
      { id: "whatsapp-business", label: "WhatsApp Business", icon: "message" },
      { id: "templates-cadences", label: "Templates & Cadences", icon: "send" }
    ]
  },
  {
    title: "Relationships",
    items: [{ id: "meetings", label: "Meetings", icon: "calendar" }]
  },
  {
    title: "Deal Execution",
    items: [{ id: "pipeline", label: "Pipeline", icon: "pipeline" }]
  },
  {
    title: "Administration",
    items: [{ id: "admin-panel", label: "Admin Panel", icon: "shield" }]
  }
];

export const topBarMeta = {
  location: "Amsterdam",
  cycle: "FY26",
  initials: "GC"
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

export const coldBulkMailingData = {
  badge: "Module",
  title: "Cold Bulk Mailing",
  description:
    "Mass email campaigns, warm-up-aware sending limits, multi-step cadences and full deliverability telemetry.",
  stats: [
    { label: "Emails Sent (30d)", value: "12,480", note: "Limit 2,000/day", noteTone: "pink" },
    { label: "Open Rate", value: "58.4%", note: "+6.1pts", noteTone: "green" },
    { label: "Reply Rate", value: "6.9%", note: "Qualified 2.1%", noteTone: "cyan" },
    { label: "Bounce Rate", value: "0.7%", note: "Healthy", noteTone: "amber" }
  ],
  campaigns: [
    ["Q3 Renewables Founders — Benelux", "Sending", "1840", "61%", "18%", "7%"],
    ["Family Office Co-Invest Outreach", "Scheduled", "0", "0%", "0%", "0%"],
    ["Manufacturing Buyout Teaser", "Completed", "2960", "54%", "14%", "5%"],
    ["MENA Infrastructure Intro Sequence", "Draft", "0", "0%", "0%", "0%"]
  ],
  deliverability: [
    ["SPF", "Aligned"],
    ["DKIM", "Signed"],
    ["DMARC", "p=quarantine"],
    ["Domain warm-up", "Day 21 of 30"],
    ["Spam complaints", "0.02%"]
  ],
  cadenceSteps: [
    ["Day 0 · Intro email", "Mandate fit + one-line credibility proof", "100% engaged", "100%"],
    ["Day 3 · Value follow-up", "Sector teaser PDF attached", "72% engaged", "72%"],
    ["Day 7 · Case study", "Comparable transaction snapshot", "48% engaged", "48%"]
  ]
};

export const templatesCadencesData = {
  badge: "Module",
  title: "Templates & Cadences",
  description:
    "One approved library for email, WhatsApp and document templates, wired into automated multi-step outreach cadences.",
  stats: [
    { label: "Templates", value: "64", note: "Unlimited plan", noteTone: "amber" },
    { label: "Active Cadences", value: "9", note: "760 contacts", noteTone: "violet" },
    { label: "Merge Fields", value: "38", note: "CRM-linked", noteTone: "cyan" },
    { label: "Best Performer", value: "61%", note: "Cold intro", noteTone: "green" }
  ],
  templateRows: [
    ["Cold intro — Renewables founder", "Email", "1840", "61%"],
    ["Follow-up — Sector teaser", "Email", "1210", "48%"],
    ["NDA reminder", "WhatsApp", "320", "94%"],
    ["IOI cover letter", "Document", "96", "—"],
    ["Portfolio quarterly update", "Email", "210", "72%"]
  ],
  cadences: [
    ["Cold outbound — 5 touch", "5 steps · 412 contacts active", "Reply 6.9%"],
    ["Warm referral — 3 touch", "3 steps · 88 contacts active", "Reply 18.2%"],
    ["Dormant lead re-activation", "4 steps · 260 contacts active", "Reply 4.1%"]
  ]
};
