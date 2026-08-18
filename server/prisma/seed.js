import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function daysAgo(n, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minutesAgo(n) {
  return new Date(Date.now() - n * 60 * 1000);
}

function randomTimeOnDay(n) {
  return daysAgo(n, Math.floor(Math.random() * 10) + 8, Math.floor(Math.random() * 60));
}

const FILLER_BODIES = [
  "Thanks, got it.",
  "Sounds good, following up shortly.",
  "Can you resend that?",
  "Received, reviewing now.",
  "Perfect, let's proceed.",
  "One moment please.",
  "Noted, thank you.",
  "Understood."
];

async function main() {
  console.log("Clearing existing data...");
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.dripStep.deleteMany(),
    prisma.dripSequence.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.template.deleteMany(),
    prisma.autoReplyRule.deleteMany(),
    prisma.autoReplySettings.deleteMany(),
    prisma.botFlowStep.deleteMany(),
    prisma.botFlow.deleteMany(),
    prisma.crmTrigger.deleteMany(),
    prisma.automationRule.deleteMany(),
    prisma.businessHour.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.businessSettings.deleteMany(),
    prisma.whatsappPhoneNumber.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.agent.deleteMany()
  ]);

  console.log("Seeding agents...");
  const [rahul, meera, vijay, anika] = await Promise.all([
    prisma.agent.create({ data: { name: "Rahul R", role: "Team Lead", status: "ONLINE", assignedCount: 32, resolvedCount: 29, avgResponseMins: 6, csat: 4.8 } }),
    prisma.agent.create({ data: { name: "Meera S", role: "Agent", status: "ONLINE", assignedCount: 27, resolvedCount: 24, avgResponseMins: 8, csat: 4.7 } }),
    prisma.agent.create({ data: { name: "Vijay K", role: "Agent", status: "AWAY", assignedCount: 19, resolvedCount: 18, avgResponseMins: 5, csat: 4.9 } }),
    prisma.agent.create({ data: { name: "Anika T", role: "Agent", status: "OFFLINE", assignedCount: 15, resolvedCount: 12, avgResponseMins: 11, csat: 4.5 } })
  ]);

  console.log("Seeding contacts & conversations...");
  const contactSeeds = [
    { initials: "DP", name: "Deepa Paul", company: "Nordwind Energy", phone: "+49 151 4432 1180", stage: "Negotiation", owner: "Rahul R", tone: "amber", agent: rahul, status: "REPLIED", preview: "Sharing the FY26 numbers tonight.", unread: 2 },
    { initials: "HP", name: "Harsha Pillai", company: "Agrivolt SA", phone: "+34 611 220 044", stage: "Qualified", owner: "Meera S", tone: "green", agent: meera, status: "ASSIGNED", preview: "Can we move the call to Thursday?", unread: 0 },
    { initials: "ND", name: "Nitin Das", company: "PortLogic Rotterdam", phone: "+31 6 1122 3344", stage: "Contacted", owner: "Vijay K", tone: "violet", agent: vijay, status: "RESOLVED", preview: "Deck received, thank you.", unread: 0 },
    { initials: "RK", name: "Ritu Kapoor", company: "CircuLoop Materials", phone: "+91 98200 11223", stage: "New", owner: "Anika T", tone: "sky", agent: anika, status: "NEW", preview: "Who signs the NDA on your side?", unread: 1 },
    { initials: "BN", name: "Bhakthi Nair", company: "Helio Grid BV", phone: "+31 6 5566 7788", stage: "New", owner: "Rahul R", tone: "blue", agent: rahul, status: "NEW", preview: "Bot: Thanks, connecting you to a specialist.", unread: 0 }
  ];

  const conversations = [];
  for (const c of contactSeeds) {
    const contact = await prisma.contact.create({
      data: { initials: c.initials, name: c.name, company: c.company, phone: c.phone, stage: c.stage, owner: c.owner, tone: c.tone }
    });
    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        agentId: c.agent.id,
        status: c.status,
        lastPreview: c.preview,
        unreadCount: c.unread,
        lastMessageAt: minutesAgo(Math.random() * 60)
      }
    });
    conversations.push(conversation);
  }

  const deepaConversation = conversations[0];
  const curatedMessages = [
    ["INBOUND", "Hi Vijay — we received the teaser, looks aligned.", 32],
    ["OUTBOUND", "Great. Shall I send the NDA so we can open the data room?", 35],
    ["INBOUND", "Yes please, to deepa.paul@nordwind.de", 36],
    ["OUTBOUND", "Sent via the NDA module — signature link valid 7 days.", 41],
    ["INBOUND", "Sharing the FY26 numbers tonight.", 60 + 4]
  ];
  for (const [direction, body, minuteOfHour] of curatedMessages) {
    const sentAt = daysAgo(0, 9, minuteOfHour);
    await prisma.message.create({
      data: { conversationId: deepaConversation.id, direction, body, status: direction === "OUTBOUND" ? "READ" : "DELIVERED", sentAt }
    });
  }

  console.log("Seeding leads...");
  await prisma.lead.createMany({
    data: [
      {
        initials: "BN",
        name: "Bhakthi Nair",
        company: "Helio Grid BV",
        email: "bhakthi.nair@heliogrid.nl",
        mobile: "+31 6 2233 4455",
        capitalAsk: "€4.5M Series A",
        status: "NEW",
        qualified: false,
        tone: "blue",
        owner: "Meera S",
        leadSource: "Website",
        territory: "Benelux",
        engagementStage: "Initial outreach",
        consentGdpr: "Opted in — 10 Aug 2026"
      },
      {
        initials: "DP",
        name: "Deepa Paul",
        company: "Nordwind Energy",
        email: "deepa.paul@nordwind.de",
        mobile: "+49 151 4432 1180",
        capitalAsk: "€12M Growth",
        status: "NEGOTIATION",
        qualified: true,
        tone: "amber",
        owner: "Rahul R",
        leadSource: "Referral",
        territory: "Benelux / DACH",
        engagementStage: "Mandate fit review",
        consentGdpr: "Opted in — 03 Aug 2026"
      },
      {
        initials: "HP",
        name: "Harsha Pillai",
        company: "Agrivolt SA",
        email: "harsha.pillai@agrivolt.es",
        mobile: "+34 611 220 044",
        capitalAsk: "€8M Bridge",
        status: "QUALIFIED",
        qualified: true,
        tone: "green",
        owner: "Vijay K",
        leadSource: "Referral",
        territory: "Iberia",
        engagementStage: "Diligence prep",
        consentGdpr: "Opted in — 28 Jul 2026"
      },
      {
        initials: "ND",
        name: "Nitin Das",
        company: "PortLogic Rotterdam",
        email: "nitin.das@portlogic.nl",
        mobile: "+31 6 1122 3344",
        capitalAsk: "€2.2M Seed",
        status: "CONTACTED",
        qualified: false,
        tone: "violet",
        owner: "Anika T",
        leadSource: "Outbound",
        territory: "Benelux",
        engagementStage: "Follow-up scheduled",
        consentGdpr: "Opted in — 02 Aug 2026"
      },
      {
        initials: "RK",
        name: "Ritu Kapoor",
        company: "CircuLoop Materials",
        email: "ritu.kapoor@circuloop.in",
        mobile: "+91 98200 11223",
        capitalAsk: "€6M Series A",
        status: "NEW",
        qualified: false,
        tone: "sky",
        owner: "Rahul R",
        leadSource: "Inbound WhatsApp",
        territory: "APAC",
        engagementStage: "Initial outreach",
        consentGdpr: "Opted in — 14 Aug 2026"
      }
    ]
  });

  console.log("Seeding 7 days of message volume for the dashboard chart...");
  const volumeByDaysAgo = [
    { daysAgo: 6, sent: 210, received: 96 },
    { daysAgo: 5, sent: 264, received: 118 },
    { daysAgo: 4, sent: 198, received: 87 },
    { daysAgo: 3, sent: 312, received: 152 },
    { daysAgo: 2, sent: 288, received: 141 },
    { daysAgo: 1, sent: 96, received: 44 },
    { daysAgo: 0, sent: 72, received: 31 }
  ];

  const bulkMessages = [];
  for (const { daysAgo: offset, sent, received } of volumeByDaysAgo) {
    for (let i = 0; i < sent; i++) {
      const conversation = conversations[i % conversations.length];
      bulkMessages.push({
        conversationId: conversation.id,
        direction: "OUTBOUND",
        body: FILLER_BODIES[i % FILLER_BODIES.length],
        status: "READ",
        sentAt: randomTimeOnDay(offset)
      });
    }
    for (let i = 0; i < received; i++) {
      const conversation = conversations[i % conversations.length];
      bulkMessages.push({
        conversationId: conversation.id,
        direction: "INBOUND",
        body: FILLER_BODIES[(i + 3) % FILLER_BODIES.length],
        status: "DELIVERED",
        sentAt: randomTimeOnDay(offset)
      });
    }
  }
  await prisma.message.createMany({ data: bulkMessages });

  console.log("Seeding templates...");
  const templateSeeds = [
    { name: "intro_investment_mandate", category: "MARKETING", status: "APPROVED", uses: 1240, readRate: 94, replyRate: 41, lastSentAt: minutesAgo(120), bodyText: "Hi {{1}}, thanks for connecting — sharing our current mandate fit for {{2}}. Happy to set up a call this week.", footerText: "Global Capital BV · Investment OS" },
    { name: "nda_signature_reminder", category: "UTILITY", status: "APPROVED", uses: 860, readRate: 97, replyRate: 52, lastSentAt: minutesAgo(40), bodyText: "Hi {{1}}, this is a reminder to countersign the NDA for {{2}} — the link expires in 48 hours. Reply here if you need a resend.", footerText: "Global Capital BV · Investment OS" },
    { name: "meeting_confirmation", category: "UTILITY", status: "APPROVED", uses: 610, readRate: 98, replyRate: 61, lastSentAt: minutesAgo(60), bodyText: "Hi {{1}}, confirming our call on {{2}} at {{3}}. Reply RESCHEDULE if you need a different time.", footerText: "Global Capital BV · Investment OS" },
    { name: "quarterly_portfolio_update", category: "MARKETING", status: "IN_REVIEW", uses: 0, readRate: 0, replyRate: 0, lastSentAt: null, bodyText: "Hi {{1}}, here is the Q{{2}} portfolio update for {{3}} — full report attached.", footerText: "Global Capital BV · Investment OS" },
    { name: "otp_login_verification", category: "AUTHENTICATION", status: "APPROVED", uses: 4120, readRate: 99, replyRate: 0, lastSentAt: minutesAgo(3), bodyText: "Your Global Capital BV verification code is {{1}}. Valid for 10 minutes.", footerText: null },
    { name: "data_room_access_teaser", category: "MARKETING", status: "REJECTED", uses: 0, readRate: 0, replyRate: 0, lastSentAt: null, bodyText: "Hallo {{1}}, hier ist Ihr Zugang zum Datenraum für {{2}}.", footerText: "Global Capital BV · Investment OS", language: "German" }
  ];
  const templates = {};
  for (const t of templateSeeds) {
    templates[t.name] = await prisma.template.create({
      data: {
        name: t.name,
        category: t.category,
        status: t.status,
        uses: t.uses,
        readRate: t.readRate,
        replyRate: t.replyRate,
        lastSentAt: t.lastSentAt,
        bodyText: t.bodyText,
        footerText: t.footerText,
        language: t.language ?? "English"
      }
    });
  }

  console.log("Seeding campaigns...");
  await prisma.campaign.createMany({
    data: [
      { name: "Q3 Renewables Founders — Benelux", templateId: templates.intro_investment_mandate.id, audienceLabel: "940 contacts", status: "SENDING", sentCount: 612, deliveredCount: 601, readCount: 540, repliedCount: 128 },
      { name: "Portfolio Quarterly Update", templateId: templates.quarterly_portfolio_update.id, audienceLabel: "310 contacts", status: "SCHEDULED", sentCount: 0, deliveredCount: 0, readCount: 0, repliedCount: 0, scheduledAt: daysAgo(-3) },
      { name: "NDA Nudge — Active Deals", templateId: templates.nda_signature_reminder.id, audienceLabel: "48 contacts", status: "COMPLETED", sentCount: 48, deliveredCount: 48, readCount: 47, repliedCount: 31 },
      { name: "MENA Infrastructure Intro", templateId: templates.intro_investment_mandate.id, audienceLabel: "1,220 contacts", status: "DRAFT", sentCount: 0, deliveredCount: 0, readCount: 0, repliedCount: 0 }
    ]
  });

  console.log("Seeding drip sequences...");
  const dripSeeds = [
    {
      name: "Cold intro — Renewables founders",
      trigger: "Lead source = Outbound",
      enrolledCount: 412,
      completionRate: 58,
      status: "ACTIVE",
      steps: [
        ["Day 0 · Mandate intro", "Immediate", "intro_investment_mandate template with sector teaser", 100],
        ["Day 2 · Value follow-up", "+2 days", "Sector one-pager PDF attached", 74],
        ["Day 5 · Case study", "+3 days", "Comparable transaction snapshot", 51],
        ["Day 9 · Call to action", "+4 days", "Prompt to book a mandate fit call", 38]
      ]
    },
    {
      name: "Warm referral nurture",
      trigger: "Lead source = Referral",
      enrolledCount: 96,
      completionRate: 77,
      status: "ACTIVE",
      steps: [
        ["Day 0 · Warm intro", "Immediate", "Personalized intro referencing the referrer", 100],
        ["Day 2 · Mandate fit", "+2 days", "Mandate fit summary + call link", 82],
        ["Day 6 · Check-in", "+4 days", "Friendly nudge if no response", 61]
      ]
    },
    {
      name: "Post-NDA data room nudge",
      trigger: "Stage = Negotiation",
      enrolledCount: 48,
      completionRate: 81,
      status: "ACTIVE",
      steps: [
        ["Day 0 · NDA reminder", "Immediate", "nda_signature_reminder template", 100],
        ["Day 1 · Data room access", "+1 day", "Access link + support contact", 88],
        ["Day 3 · Final nudge", "+2 days", "Reminder before access expires", 64]
      ]
    },
    {
      name: "Dormant lead re-activation",
      trigger: "No activity 30d",
      enrolledCount: 260,
      completionRate: 34,
      status: "PAUSED",
      steps: [
        ["Day 0 · Re-engagement", "Immediate", "\"Still relevant?\" check-in message", 100],
        ["Day 4 · New mandate teaser", "+4 days", "Highlight of a new sector mandate", 29],
        ["Day 10 · Final check-in", "+6 days", "Last message before archiving", 12]
      ]
    }
  ];
  for (const seq of dripSeeds) {
    const sequence = await prisma.dripSequence.create({
      data: { name: seq.name, trigger: seq.trigger, enrolledCount: seq.enrolledCount, completionRate: seq.completionRate, status: seq.status }
    });
    await prisma.dripStep.createMany({
      data: seq.steps.map(([title, delayLabel, message, engagementRate], index) => ({
        sequenceId: sequence.id,
        stepOrder: index,
        title,
        delayLabel,
        message,
        engagementRate
      }))
    });
  }

  console.log("Seeding auto-reply settings & rules...");
  await prisma.autoReplySettings.create({
    data: {
      greetingEnabled: true,
      greetingMessage: "Hi 👋 thanks for reaching out to Global Capital BV. A member of the investment team will respond shortly.",
      awayEnabled: true,
      awayMessage: "We're currently outside business hours (09:00–18:00 CET). We'll reply first thing tomorrow.",
      awayHours: "Outside Mon–Fri 09:00–18:00 CET"
    }
  });
  await prisma.autoReplyRule.createMany({
    data: [
      { keyword: "nda", matchType: "CONTAINS", reply: "nda_signature_reminder", status: "ACTIVE", triggered: 214 },
      { keyword: "meeting / call", matchType: "CONTAINS", reply: "meeting_confirmation", status: "ACTIVE", triggered: 168 },
      { keyword: "deck / teaser", matchType: "CONTAINS", reply: "Send investor deck link", status: "ACTIVE", triggered: 96 },
      { keyword: "unsubscribe", matchType: "EXACT", reply: "Opt-out confirmation + suppress contact", status: "ACTIVE", triggered: 12 },
      { keyword: "pricing", matchType: "CONTAINS", reply: "Route to human agent", status: "PAUSED", triggered: 4 }
    ]
  });

  console.log("Seeding bot flows...");
  const flowSeeds = [
    {
      name: "New enquiry qualification",
      trigger: "Keyword: hi / hello / invest",
      completionRate: 74,
      active: true,
      usersCount: 128,
      steps: [
        ["TRIGGER", "Trigger", "Keyword match: \"hi\", \"hello\", \"invest\""],
        ["MESSAGE", "Send message", "Greeting + quick-reply menu (Raise capital / Invest / Portfolio support)"],
        ["QUESTION", "Ask question", "\"What's your target raise size?\" — free text"],
        ["CONDITION", "Condition", "Raise size ≥ €2M → continue · else → nurture sequence"],
        ["ACTION", "CRM action", "Create lead, set Capital Ask, assign to territory owner"],
        ["ACTION", "Handoff", "Transfer to human agent with full transcript"]
      ]
    },
    {
      name: "Capital ask intake",
      trigger: "Button: I want funding",
      completionRate: 68,
      active: true,
      usersCount: 96,
      steps: [
        ["TRIGGER", "Trigger", "Button tap: \"I want funding\""],
        ["QUESTION", "Ask question", "\"What sector are you raising in?\""],
        ["QUESTION", "Ask question", "\"What's your target raise size?\""],
        ["ACTION", "CRM action", "Create lead with sector + capital ask fields"],
        ["ACTION", "Handoff", "Route to territory owner"]
      ]
    },
    {
      name: "NDA & data room access",
      trigger: "Keyword: nda / data room",
      completionRate: 81,
      active: true,
      usersCount: 54,
      steps: [
        ["TRIGGER", "Trigger", "Keyword match: \"nda\", \"data room\""],
        ["MESSAGE", "Send message", "nda_signature_reminder template"],
        ["CONDITION", "Condition", "Signed within 48h → grant access · else → escalate"],
        ["ACTION", "CRM action", "Log activity on deal timeline"]
      ]
    },
    {
      name: "Portfolio company support",
      trigger: "Keyword: support",
      completionRate: 59,
      active: true,
      usersCount: 34,
      steps: [
        ["TRIGGER", "Trigger", "Keyword match: \"support\""],
        ["QUESTION", "Ask question", "\"Which portfolio company are you contacting about?\""],
        ["CONDITION", "Condition", "Known company → route to portfolio ops · else → general enquiry"],
        ["ACTION", "CRM action", "Create support ticket"],
        ["ACTION", "Handoff", "Transfer to portfolio ops agent"]
      ]
    },
    {
      name: "Event RSVP flow",
      trigger: "Campaign: Investor Summit",
      completionRate: null,
      active: false,
      usersCount: 0,
      steps: [
        ["TRIGGER", "Trigger", "Campaign link click: Investor Summit"],
        ["QUESTION", "Ask question", "\"Will you be attending in person or virtually?\""],
        ["ACTION", "CRM action", "Log RSVP status on contact record"]
      ]
    }
  ];
  for (const flow of flowSeeds) {
    const created = await prisma.botFlow.create({
      data: { name: flow.name, trigger: flow.trigger, completionRate: flow.completionRate, active: flow.active, usersCount: flow.usersCount }
    });
    await prisma.botFlowStep.createMany({
      data: flow.steps.map(([type, label, detail], index) => ({ flowId: created.id, stepOrder: index, type, label, detail }))
    });
  }

  console.log("Seeding CRM triggers...");
  await prisma.crmTrigger.createMany({
    data: [
      { event: "New WhatsApp message received", action: "Create Lead if no match on phone number", status: "ACTIVE", lastTriggeredAt: minutesAgo(3) },
      { event: "Keyword \"invest\" detected in chat", action: "Set Lead Status = New, Tag = Inbound WhatsApp", status: "ACTIVE", lastTriggeredAt: minutesAgo(18) },
      { event: "Template \"nda_signature_reminder\" delivered", action: "Log activity on deal timeline", status: "ACTIVE", lastTriggeredAt: minutesAgo(40) },
      { event: "No reply within 24h of last outbound", action: "Create follow-up task for owner", status: "ACTIVE", lastTriggeredAt: minutesAgo(60) },
      { event: "Bot flow completed: Capital ask intake", action: "Update Capital Ask field on lead record", status: "ACTIVE", lastTriggeredAt: minutesAgo(120) },
      { event: "Contact replies \"unsubscribe\"", action: "Set opt-out, suppress from all campaigns", status: "ACTIVE", lastTriggeredAt: minutesAgo(360) },
      { event: "Deal stage changes to Negotiation", action: "Send meeting_confirmation template", status: "DRAFT", lastTriggeredAt: null }
    ]
  });

  console.log("Seeding automation rules...");
  await prisma.automationRule.createMany({
    data: [
      { name: "Round-robin lead assignment", condition: "New WhatsApp lead created", action: "Assign to next available owner in territory rotation", enabled: true, executions: 214 },
      { name: "SLA escalation", condition: "No first reply within 15 minutes", action: "Notify team lead + escalate to backup agent", enabled: true, executions: 38 },
      { name: "Bot-to-human handoff", condition: "Bot flow confidence < 60% or user requests agent", action: "Transfer session with transcript to available agent", enabled: true, executions: 89 },
      { name: "Opt-out compliance", condition: "Contact sends STOP / unsubscribe", action: "Suppress from all campaigns, log consent change", enabled: true, executions: 12 },
      { name: "Dormant lead re-engagement", condition: "No activity for 30 days", action: "Enroll in Dormant lead re-activation drip", enabled: false, executions: 0 }
    ]
  });

  console.log("Seeding business settings...");
  await prisma.businessSettings.create({
    data: {
      phone: "+31 20 891 4477",
      displayName: "Global Capital BV",
      category: "Financial Services",
      wabaId: "102938475610293",
      tier: "Tier 2 · 10,000 conversations / 24h",
      quality: "High",
      status: "Connected",
      webhookUrl: "https://api.globalcapital.io/webhooks/whatsapp",
      webhookVerifyToken: "95730ef64a3f84538eb41529d10ab830",
      appIdMasked: "•••• •••• 8841",
      tokenStatus: "Valid · expires in 47 days",
      lastPingAt: minutesAgo(2),
      phoneNumberId: "1241656785692228",
      campaignBatchSize: 50,
      autoCreateLead: false,
      leadDefaultStatus: "Default",
      leadDefaultSource: "Default",
      leadDefaultAssignedTo: "Default",
      leadWebhookApiKey: `gc_live_${crypto.randomBytes(24).toString("hex")}`
    }
  });
  await prisma.whatsappPhoneNumber.create({
    data: {
      phoneNumber: "+31 20 891 4477",
      displayName: "Global Capital BV",
      qualityRating: "High",
      status: "Connected",
      isSending: true
    }
  });
  await prisma.businessHour.createMany({
    data: [
      { dayLabel: "Mon – Fri", hoursLabel: "09:00 – 18:00 CET", sortOrder: 0 },
      { dayLabel: "Saturday", hoursLabel: "10:00 – 14:00 CET", sortOrder: 1 },
      { dayLabel: "Sunday", hoursLabel: "Closed", sortOrder: 2 }
    ]
  });
  await prisma.notificationPreference.createMany({
    data: [
      { label: "New message alerts", enabled: true },
      { label: "SLA breach alerts", enabled: true },
      { label: "Campaign delivery reports", enabled: true },
      { label: "Weekly performance digest", enabled: false }
    ]
  });

  console.log("Seeding activity log...");
  await prisma.activityLog.createMany({
    data: [
      { who: "Deepa Paul", what: "replied to NDA signature reminder", tone: "green", createdAt: minutesAgo(2) },
      { who: "Bot Flow", what: "qualified Bhakthi Nair via Series A intake", tone: "violet", createdAt: minutesAgo(18) },
      { who: "Harsha Pillai", what: "requested to reschedule Thursday call", tone: "amber", createdAt: minutesAgo(60) },
      { who: "CRM Trigger", what: "created follow-up task for Ritu Kapoor", tone: "blue", createdAt: minutesAgo(180) },
      { who: "Broadcast", what: "Q3 Renewables campaign delivered to 940 contacts", tone: "cyan", createdAt: minutesAgo(300) }
    ]
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
