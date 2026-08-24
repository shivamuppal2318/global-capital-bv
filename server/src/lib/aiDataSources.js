// What the AI Assistant is allowed to read, as toggleable sources. An
// admin ticks these in Admin Panel → AI Assistant; anything unticked is
// never fetched, so it can't reach the model even indirectly.
//
// Two reasons this matters beyond privacy: every section costs tokens on
// every question, and a snapshot with irrelevant sections in it measurably
// dilutes answers. Turning off what you don't ask about makes replies
// cheaper and sharper.
export const AI_DATA_SOURCES = [
  {
    id: "leads",
    label: "CRM leads",
    description: "Every lead with stage, qualification, capital ask, owner, territory and contact details."
  },
  {
    id: "follow-ups",
    label: "Customer follow-ups",
    description: "Cold-outreach leads: which stage each is at, reply type, NDA signed, call booked/completed."
  },
  {
    id: "deal-stages",
    label: "Deal progression",
    description: "Where each lead sits across NDA, calls, data room, IOI, visits and term sheet — with amounts and dates."
  },
  {
    id: "meetings",
    label: "Zoom calls & meetings",
    description:
      "Scheduled and past calls \u2014 topic, time, duration, attendees, call notes, AI summaries, next actions and satisfaction ratings."
  },
  {
    id: "nda",
    label: "NDAs",
    description: "NDA status per lead \u2014 sent, reminded, signed, declined or expired, with dates, signer and owner."
  },
  {
    id: "ioi",
    label: "Indications of interest",
    description:
      "IOIs per lead \u2014 status, value, industry, geography, and the dates each was generated, sent and signed."
  },
  {
    id: "visits",
    label: "Site visits",
    description:
      "Planned and completed counterparty visits \u2014 dates, location, region, purpose, cost and whether a report came back."
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Conversations, templates, campaigns, drip sequences, auto-replies, bot flows and triggers."
  },
  {
    id: "email-campaigns",
    label: "Email campaigns",
    description: "Cold email campaigns with status, cadence length, daily limits and assigned mailbox."
  },
  {
    id: "team",
    label: "Agent performance",
    description: "WhatsApp agent workload — assigned, resolved, average response time and CSAT."
  },
  {
    id: "employees",
    label: "Employee accounts",
    description: "Staff logins: name, email, role, active/suspended, and last sign-in. No passwords, ever."
  },
  {
    id: "market-signals",
    label: "Market intelligence",
    description: "Captured market signals — company, signal type, relevance score and summary."
  },
  {
    id: "documents",
    label: "Data Room documents",
    description: "Company documents, retrieved per question, plus any pinned as always-on knowledge."
  }
];

export const AI_DATA_SOURCE_IDS = AI_DATA_SOURCES.map((s) => s.id);

// A fresh install gets everything — the assistant is more useful knowing
// more, and an admin can narrow it. Written explicitly on first save so
// that later unticking everything means none rather than falling back here.
export const DEFAULT_AI_DATA_SOURCES = AI_DATA_SOURCE_IDS;

// `enabled` is null/undefined only when no AiSettings row exists yet — that
// means "never configured", so everything is on. Once a row exists the
// stored array is taken literally, including an empty one: an admin who
// unticks every box gets an assistant with no database access, which is
// what they asked for. Emptiness must not be overloaded to mean "all".
export function isSourceEnabled(enabled, id) {
  if (enabled === null || enabled === undefined) return true;
  if (!Array.isArray(enabled)) return true;
  return enabled.includes(id);
}
