export const whatsappTabs = [
  { id: "dashboard", label: "Dashboard", icon: "chart" },
  { id: "chat", label: "Chat", icon: "chat", badge: "3" },
  { id: "templates", label: "Templates", icon: "note" },
  { id: "campaigns", label: "Campaigns", icon: "megaphone" },
  { id: "drip", label: "Drip Campaigns", icon: "droplet" },
  { id: "auto-replies", label: "Auto Replies", icon: "zap" },
  { id: "bot-flows", label: "Bot Flows", icon: "workflow" },
  { id: "crm-triggers", label: "CRM Triggers", icon: "link" },
  { id: "automation", label: "Automation", icon: "sliders" },
  { id: "settings", label: "Settings", icon: "cog" }
];

export const whatsappOverview = {
  badge: "Module · WhatsApp Business API",
  title: "WhatsApp Business",
  description:
    "Official WhatsApp Business API — conversations, approved templates, campaigns, drip sequences, bots and CRM automation in one workspace.",
  stats: [
    { label: "Active Conversations", value: "87", note: "24h window", noteTone: "green" },
    { label: "Template Messages", value: "1,240", note: "Last 30 days", noteTone: "cyan" },
    { label: "Read Rate", value: "94%", note: "+11pts vs email", noteTone: "blue" },
    { label: "Reply Rate", value: "38%", note: "Median 12m", noteTone: "indigo" }
  ]
};

export const dashboardData = {
  volume: [
    { day: "Mon", sent: 210, received: 96 },
    { day: "Tue", sent: 264, received: 118 },
    { day: "Wed", sent: 198, received: 87 },
    { day: "Thu", sent: 312, received: 152 },
    { day: "Fri", sent: 288, received: 141 },
    { day: "Sat", sent: 96, received: 44 },
    { day: "Sun", sent: 72, received: 31 }
  ],
  funnel: [
    { stage: "New", count: 128, width: "100%", tone: "cyan" },
    { stage: "Assigned", count: 104, width: "81%", tone: "violet" },
    { stage: "Replied", count: 87, width: "68%", tone: "amber" },
    { stage: "Resolved", count: 74, width: "58%", tone: "green" }
  ],
  topTemplates: [
    ["intro_investment_mandate", "1,240 sent", "94% read", "41% reply"],
    ["nda_signature_reminder", "860 sent", "97% read", "52% reply"],
    ["meeting_confirmation", "610 sent", "98% read", "61% reply"],
    ["quarterly_portfolio_update", "210 sent", "88% read", "19% reply"]
  ],
  agents: [
    ["Rahul R", "32 assigned", "29 resolved", "6m avg", "4.8"],
    ["Meera S", "27 assigned", "24 resolved", "8m avg", "4.7"],
    ["Vijay K", "19 assigned", "18 resolved", "5m avg", "4.9"],
    ["Anika T", "15 assigned", "12 resolved", "11m avg", "4.5"]
  ],
  activity: [
    { who: "Deepa Paul", what: "replied to NDA signature reminder", time: "2m ago", tone: "green" },
    { who: "Bot Flow", what: "qualified Bhakthi Nair via Series A intake", time: "18m ago", tone: "violet" },
    { who: "Harsha Pillai", what: "requested to reschedule Thursday call", time: "1h ago", tone: "amber" },
    { who: "CRM Trigger", what: "created follow-up task for Ritu Kapoor", time: "3h ago", tone: "blue" },
    { who: "Broadcast", what: "Q3 Renewables campaign delivered to 940 contacts", time: "5h ago", tone: "cyan" }
  ]
};

export const chatData = {
  filters: ["All", "Unread", "Assigned to me", "Unassigned"],
  conversations: [
    { initials: "DP", name: "Deepa Paul", company: "Nordwind Energy", preview: "Sharing the FY26 numbers tonight.", time: "2m", unread: 2, tone: "amber" },
    { initials: "HP", name: "Harsha Pillai", company: "Agrivolt SA", preview: "Can we move the call to Thursday?", time: "1h", unread: 0, tone: "green" },
    { initials: "ND", name: "Nitin Das", company: "PortLogic Rotterdam", preview: "Deck received, thank you.", time: "4h", unread: 0, tone: "violet" },
    { initials: "RK", name: "Ritu Kapoor", company: "CircuLoop Materials", preview: "Who signs the NDA on your side?", time: "1d", unread: 1, tone: "sky" },
    { initials: "BN", name: "Bhakthi Nair", company: "Helio Grid BV", preview: "Bot: Thanks, connecting you to a specialist.", time: "1d", unread: 0, tone: "blue" }
  ],
  activeContact: {
    initials: "DP",
    name: "Deepa Paul",
    company: "Nordwind Energy",
    phone: "+49 151 4432 1180",
    stage: "Negotiation",
    owner: "Rahul R"
  },
  messages: [
    ["left", "Hi Vijay — we received the teaser, looks aligned.", "09:32"],
    ["right", "Great. Shall I send the NDA so we can open the data room?", "09:35"],
    ["left", "Yes please, to deepa.paul@nordwind.de", "09:36"],
    ["right", "Sent via the NDA module — signature link valid 7 days.", "09:41"],
    ["left", "Sharing the FY26 numbers tonight.", "10:04"]
  ],
  quickReplies: ["Send NDA", "Share deck", "Confirm meeting", "Ask for signatory"]
};

export const templatesData = {
  stats: [
    { label: "Total Templates", value: "22", note: "WABA library", noteTone: "blue" },
    { label: "Approved", value: "17", note: "Ready to send", noteTone: "green" },
    { label: "In Review", value: "3", note: "Meta review", noteTone: "amber" },
    { label: "Rejected", value: "2", note: "Needs edits", noteTone: "red" }
  ],
  categories: ["All", "Marketing", "Utility", "Authentication"],
  rows: [
    { name: "intro_investment_mandate", category: "Marketing", language: "English", status: "Approved", uses: 1240, lastSent: "2h ago", readRate: "94%" },
    { name: "nda_signature_reminder", category: "Utility", language: "English", status: "Approved", uses: 860, lastSent: "40m ago", readRate: "97%" },
    { name: "meeting_confirmation", category: "Utility", language: "English", status: "Approved", uses: 610, lastSent: "1h ago", readRate: "98%" },
    { name: "quarterly_portfolio_update", category: "Marketing", language: "English", status: "In review", uses: 0, lastSent: "—", readRate: "—" },
    { name: "otp_login_verification", category: "Authentication", language: "English", status: "Approved", uses: 4120, lastSent: "3m ago", readRate: "99%" },
    { name: "data_room_access_teaser", category: "Marketing", language: "German", status: "Rejected", uses: 0, lastSent: "—", readRate: "—" }
  ],
  preview: {
    name: "nda_signature_reminder",
    body: "Hi {{1}}, this is a reminder to countersign the NDA for {{2}} — the link expires in 48 hours. Reply here if you need a resend.",
    footer: "Global Capital BV · Investment OS"
  }
};

export const campaignsData = {
  stats: [
    { label: "Campaigns Sent (30d)", value: "14", note: "3 active now", noteTone: "blue" },
    { label: "Recipients", value: "9,480", note: "Across all campaigns", noteTone: "cyan" },
    { label: "Delivered Rate", value: "98.2%", note: "Healthy", noteTone: "green" },
    { label: "Reply Rate", value: "22.6%", note: "+4pts MoM", noteTone: "indigo" }
  ],
  rows: [
    { name: "Q3 Renewables Founders — Benelux", template: "intro_investment_mandate", audience: "940 contacts", status: "Sending", sent: "612", delivered: "601", read: "540", replied: "128" },
    { name: "Portfolio Quarterly Update", template: "quarterly_portfolio_update", audience: "310 contacts", status: "Scheduled", sent: "0", delivered: "0", read: "0", replied: "0" },
    { name: "NDA Nudge — Active Deals", template: "nda_signature_reminder", audience: "48 contacts", status: "Completed", sent: "48", delivered: "48", read: "47", replied: "31" },
    { name: "MENA Infrastructure Intro", template: "intro_investment_mandate", audience: "1,220 contacts", status: "Draft", sent: "0", delivered: "0", read: "0", replied: "0" }
  ]
};

export const dripCampaignsData = {
  stats: [
    { label: "Active Sequences", value: "5", note: "1,180 enrolled", noteTone: "violet" },
    { label: "Avg Completion", value: "64%", note: "Across sequences", noteTone: "green" },
    { label: "Avg Reply Step", value: "Step 2", note: "Highest engagement", noteTone: "cyan" },
    { label: "Opt-outs", value: "1.8%", note: "Within policy", noteTone: "amber" }
  ],
  sequences: [
    { name: "Cold intro — Renewables founders", trigger: "Lead source = Outbound", enrolled: 412, completion: "58%", status: "Active" },
    { name: "Warm referral nurture", trigger: "Lead source = Referral", enrolled: 96, completion: "77%", status: "Active" },
    { name: "Post-NDA data room nudge", trigger: "Stage = Negotiation", enrolled: 48, completion: "81%", status: "Active" },
    { name: "Dormant lead re-activation", trigger: "No activity 30d", enrolled: 260, completion: "34%", status: "Paused" }
  ],
  activeSteps: [
    ["Day 0 · Mandate intro", "Immediate", "intro_investment_mandate template with sector teaser", "100% engaged", "100%"],
    ["Day 2 · Value follow-up", "+2 days", "Sector one-pager PDF attached", "74% engaged", "74%"],
    ["Day 5 · Case study", "+3 days", "Comparable transaction snapshot", "51% engaged", "51%"],
    ["Day 9 · Call to action", "+4 days", "Prompt to book a mandate fit call", "38% engaged", "38%"]
  ]
};

export const autoRepliesData = {
  greeting: { enabled: true, message: "Hi 👋 thanks for reaching out to Global Capital BV. A member of the investment team will respond shortly." },
  away: {
    enabled: true,
    message: "We're currently outside business hours (09:00–18:00 CET). We'll reply first thing tomorrow.",
    hours: "Outside Mon–Fri 09:00–18:00 CET"
  },
  rules: [
    { keyword: "nda", matchType: "Contains", reply: "nda_signature_reminder", status: "Active", triggered: 214 },
    { keyword: "meeting / call", matchType: "Contains", reply: "meeting_confirmation", status: "Active", triggered: 168 },
    { keyword: "deck / teaser", matchType: "Contains", reply: "Send investor deck link", status: "Active", triggered: 96 },
    { keyword: "unsubscribe", matchType: "Exact", reply: "Opt-out confirmation + suppress contact", status: "Active", triggered: 12 },
    { keyword: "pricing", matchType: "Contains", reply: "Route to human agent", status: "Paused", triggered: 4 }
  ]
};

export const botFlowsData = {
  stats: [
    { label: "Live Flows", value: "4", note: "1 in draft", noteTone: "violet" },
    { label: "Users in Flows", value: "312", note: "Last 7 days", noteTone: "blue" },
    { label: "Completion Rate", value: "71%", note: "+5pts", noteTone: "green" },
    { label: "Handoffs to Human", value: "89", note: "28% of sessions", noteTone: "amber" }
  ],
  flows: [
    { name: "New enquiry qualification", trigger: "Keyword: hi / hello / invest", steps: 6, completion: "74%", active: true, users: 128 },
    { name: "Capital ask intake", trigger: "Button: I want funding", steps: 5, completion: "68%", active: true, users: 96 },
    { name: "NDA & data room access", trigger: "Keyword: nda / data room", steps: 4, completion: "81%", active: true, users: 54 },
    { name: "Portfolio company support", trigger: "Keyword: support", steps: 5, completion: "59%", active: true, users: 34 },
    { name: "Event RSVP flow", trigger: "Campaign: Investor Summit", steps: 3, completion: "—", active: false, users: 0 }
  ],
  activeFlowSteps: [
    { type: "trigger", label: "Trigger", detail: "Keyword match: \"hi\", \"hello\", \"invest\"" },
    { type: "message", label: "Send message", detail: "Greeting + quick-reply menu (Raise capital / Invest / Portfolio support)" },
    { type: "question", label: "Ask question", detail: "\"What's your target raise size?\" — free text" },
    { type: "condition", label: "Condition", detail: "Raise size ≥ €2M → continue · else → nurture sequence" },
    { type: "action", label: "CRM action", detail: "Create lead, set Capital Ask, assign to territory owner" },
    { type: "action", label: "Handoff", detail: "Transfer to human agent with full transcript" }
  ]
};

export const crmTriggersData = {
  stats: [
    { label: "Active Triggers", value: "9", note: "2 draft", noteTone: "blue" },
    { label: "Fired (30d)", value: "1,860", note: "Across all triggers", noteTone: "cyan" },
    { label: "Leads Created", value: "142", note: "From WhatsApp events", noteTone: "green" },
    { label: "Tasks Created", value: "318", note: "Auto-assigned", noteTone: "violet" }
  ],
  rules: [
    { event: "New WhatsApp message received", action: "Create Lead if no match on phone number", status: "Active", lastTriggered: "3m ago" },
    { event: "Keyword \"invest\" detected in chat", action: "Set Lead Status = New, Tag = Inbound WhatsApp", status: "Active", lastTriggered: "18m ago" },
    { event: "Template \"nda_signature_reminder\" delivered", action: "Log activity on deal timeline", status: "Active", lastTriggered: "40m ago" },
    { event: "No reply within 24h of last outbound", action: "Create follow-up task for owner", status: "Active", lastTriggered: "1h ago" },
    { event: "Bot flow completed: Capital ask intake", action: "Update Capital Ask field on lead record", status: "Active", lastTriggered: "2h ago" },
    { event: "Contact replies \"unsubscribe\"", action: "Set opt-out, suppress from all campaigns", status: "Active", lastTriggered: "6h ago" },
    { event: "Deal stage changes to Negotiation", action: "Send meeting_confirmation template", status: "Draft", lastTriggered: "—" }
  ]
};

export const automationData = {
  rules: [
    {
      name: "Round-robin lead assignment",
      condition: "New WhatsApp lead created",
      action: "Assign to next available owner in territory rotation",
      status: true,
      executions: 214
    },
    {
      name: "SLA escalation",
      condition: "No first reply within 15 minutes",
      action: "Notify team lead + escalate to backup agent",
      status: true,
      executions: 38
    },
    {
      name: "Bot-to-human handoff",
      condition: "Bot flow confidence < 60% or user requests agent",
      action: "Transfer session with transcript to available agent",
      status: true,
      executions: 89
    },
    {
      name: "Opt-out compliance",
      condition: "Contact sends STOP / unsubscribe",
      action: "Suppress from all campaigns, log consent change",
      status: true,
      executions: 12
    },
    {
      name: "Dormant lead re-engagement",
      condition: "No activity for 30 days",
      action: "Enroll in Dormant lead re-activation drip",
      status: false,
      executions: 0
    }
  ]
};

export const settingsData = {
  account: {
    phone: "+31 20 891 4477",
    displayName: "Global Capital BV",
    category: "Financial Services",
    wabaId: "102938475610293",
    tier: "Tier 2 · 10,000 conversations / 24h",
    quality: "High",
    status: "Connected"
  },
  webhook: {
    url: "https://api.globalcapital.io/webhooks/whatsapp",
    appId: "•••• •••• 8841",
    tokenStatus: "Valid · expires in 47 days",
    lastPing: "Healthy · 2m ago"
  },
  businessHours: [
    ["Mon – Fri", "09:00 – 18:00 CET"],
    ["Saturday", "10:00 – 14:00 CET"],
    ["Sunday", "Closed"]
  ],
  team: [
    { name: "Rahul R", role: "Team Lead", status: "Online" },
    { name: "Meera S", role: "Agent", status: "Online" },
    { name: "Vijay K", role: "Agent", status: "Away" },
    { name: "Anika T", role: "Agent", status: "Offline" }
  ],
  notifications: [
    { label: "New message alerts", enabled: true },
    { label: "SLA breach alerts", enabled: true },
    { label: "Campaign delivery reports", enabled: true },
    { label: "Weekly performance digest", enabled: false }
  ]
};
