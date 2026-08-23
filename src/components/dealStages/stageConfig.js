// Per-stage presentation for the shared DealStageModule. The stages share
// one table and one screen; this is the only place they differ.
//
// `fields` lists which of the record's optional columns this stage actually
// uses, so an IOI form shows amount/valuation and a field visit shows
// location/attendees instead of every stage showing all of them.

export const STAGE_CONFIG = {
  NDA: {
    label: "NDA",
    accent: "bg-[#eef1ff] text-[#3046b2]",
    blurb: "Non-disclosure agreements sent, signed and on file — the gate before anything confidential is shared.",
    scheduledLabel: "Sent on",
    completedLabel: "Signed on",
    fields: ["counterparty", "scheduledAt", "completedAt", "owner", "document", "notes"],
    emptyHint: "Record an NDA against a lead to start tracking who has signed."
  },
  IOI: {
    label: "IOI",
    accent: "bg-[#efe5ff] text-[#8853d0]",
    blurb: "Indications of interest — the non-binding range put to each counterparty, and what came back.",
    scheduledLabel: "Submitted on",
    completedLabel: "Answered on",
    fields: ["amount", "valuation", "counterparty", "scheduledAt", "completedAt", "owner", "document", "notes"],
    emptyHint: "Log an IOI once you've put a range to a counterparty."
  },
  VISIT_PLANNING: {
    label: "Visit Planning",
    accent: "bg-[#ffe9d0] text-[#c47f1a]",
    blurb: "Arranging site visits — when, where, and who's going.",
    scheduledLabel: "Planned for",
    completedLabel: "Confirmed on",
    fields: ["location", "attendees", "scheduledAt", "completedAt", "owner", "notes"],
    emptyHint: "Plan a visit to put a date, location and attendee list against a lead."
  },
  FIELD_VISIT: {
    label: "Field Visit",
    accent: "bg-[#dff5e7] text-[#2b9b60]",
    blurb: "The visits themselves and what came out of them.",
    scheduledLabel: "Visit date",
    completedLabel: "Report filed",
    fields: ["location", "attendees", "scheduledAt", "completedAt", "owner", "document", "notes"],
    emptyHint: "Record a visit once it's happened, with findings in the notes."
  },
  TERM_SHEET: {
    label: "Term Sheet",
    accent: "bg-[#dff2ff] text-[#2995db]",
    blurb: "Binding terms issued, negotiated and signed.",
    scheduledLabel: "Issued on",
    completedLabel: "Signed on",
    fields: ["amount", "valuation", "counterparty", "scheduledAt", "completedAt", "owner", "document", "notes"],
    emptyHint: "Add a term sheet once terms have gone out."
  }
};

// Which sidebar id opens which stage. Zoom Call and Data Room deliberately
// aren't here — they keep their existing purpose-built screens.
export const MODULE_TO_STAGE = {
  nda: "NDA",
  ioi: "IOI",
  "visit-planning": "VISIT_PLANNING",
  "field-visit": "FIELD_VISIT",
  "term-sheet": "TERM_SHEET"
};

export const STATUS_TONE = {
  NOT_STARTED: "slate",
  IN_PROGRESS: "amber",
  COMPLETED: "green",
  DECLINED: "red",
  ON_HOLD: "blue"
};

export const STATUS_LABEL = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  ON_HOLD: "On hold"
};

export const FIELD_LABEL = {
  amount: "Amount",
  valuation: "Valuation",
  location: "Location",
  attendees: "Attendees",
  counterparty: "Counterparty contact",
  owner: "Owner",
  notes: "Notes"
};

export const FIELD_PLACEHOLDER = {
  amount: "EUR 2–4M",
  valuation: "EUR 18M pre-money",
  location: "Rotterdam site",
  attendees: "Rahul R, Meera S",
  counterparty: "Name of who signed / negotiated",
  owner: "Who owns this stage",
  notes: "Anything worth remembering"
};
