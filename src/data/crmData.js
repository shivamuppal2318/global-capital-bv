// Only modules that are actually built out are listed. Lead Discovery,
// Qualification, Telephony & SMS, Companies, Contacts, Communications,
// Deals and Pipeline are not shown — they were placeholders rendering an
// empty page. Templates & Cadences isn't a top-level entry either, but
// unlike those it IS reachable — as a tab inside Email Automation (see
// EmailOutreachModule.jsx) rather than its own nav item. Keep this in step
// with server/src/lib/permissions.js — the ids there drive both the Admin
// Panel checkboxes and the API's own access checks.
export const navSections = [
  {
    title: "Intelligence",
    items: [
      { id: "command-center", label: "Executive Dashboard", icon: "grid" },
      { id: "universal-filters", label: "Universal Filters", icon: "sliders" },
      { id: "market-intelligence", label: "Market Intelligence", icon: "radar", badge: "AI" },
      { id: "leads", label: "Outreach / DOE", icon: "send" }
    ]
  },
  {
    title: "CRM & Outreach",
    items: [
      { id: "crm-workspace", label: "CRM Workspace", icon: "users" },
      // "Email Automation" groups everything email-related — Campaigns,
      // Leads, Replies, Automation (drip sequences), Templates, Settings —
      // as tabs inside one module (see EmailOutreachModule.jsx), rather than
      // Templates & Cadences living as its own separate top-level nav entry.
      { id: "cold-bulk-mailing", label: "Email Automation", icon: "mailbox" },
      { id: "whatsapp-business", label: "WhatsApp Business", icon: "message" }
    ]
  },
  {
    // The deal progression, in the order a deal actually moves through it.
    // Zoom Call and Data Room point at the existing purpose-built screens;
    // the other five share DealStageModule (see stageConfig.js).
    title: "Relationships",
    items: [
      { id: "nda", label: "NDA", icon: "shield" },
      { id: "meetings", label: "Zoom Call", icon: "calendar" },
      { id: "data-room", label: "Data Room", icon: "folder" },
      { id: "ioi", label: "IOI", icon: "note" },
      { id: "visit-planning", label: "Visit Planning", icon: "radar" },
      { id: "field-visit", label: "Field Visit", icon: "userCheck" },
      { id: "term-sheet", label: "Term Sheet", icon: "send" },
      // Not a pipeline stage — a directory of the referring/introducing
      // organisations themselves, separate from the Channel Partner filter
      // tag on a lead (Universal Filters, CRM Workspace edit form).
      { id: "channel-partner", label: "Channel Partner", icon: "link" },
      // A cross-cutting report over the same deal-stage data above, rather
      // than another stage of the pipeline — kept in this section since
      // that's what it reports on. Per-DOE activity itself lives in
      // Outreach/DOE (Intelligence section) — not duplicated here.
      { id: "ageing-report", label: "Ageing Report", icon: "clock" }
    ]
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
