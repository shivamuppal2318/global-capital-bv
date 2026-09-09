// The deal progression, in order. Shared by the API's validation, the
// permission module list and the frontend's per-stage field config, so
// adding a stage means editing one list rather than hunting through three.
//
// `module` is the sidebar/permission id that opens this stage — ZOOM_CALL
// and DATA_ROOM reuse the screens that already existed rather than getting
// duplicates.
export const DEAL_STAGES = [
  {
    id: "NDA",
    label: "NDA",
    module: "nda",
    blurb: "Non-disclosure agreement sent, signed and on file before anything confidential is shared."
  },
  {
    id: "ZOOM_CALL",
    label: "Zoom Call",
    module: "meetings",
    blurb: "Intro and follow-up calls with the counterparty."
  },
  {
    id: "DATA_ROOM",
    label: "Data Room",
    module: "data-room",
    blurb: "Diligence materials shared and reviewed."
  },
  {
    id: "IOI",
    label: "IOI",
    module: "ioi",
    blurb: "Indication of interest — the non-binding range put to the counterparty."
  },
  {
    id: "VISIT_PLANNING",
    label: "Visit Planning",
    module: "visit-planning",
    blurb: "Arranging the site visit: date, location and who attends."
  },
  {
    id: "FIELD_VISIT",
    label: "Field Visit",
    module: "field-visit",
    blurb: "The visit itself and what came out of it."
  },
  {
    id: "TERM_SHEET",
    label: "Term Sheet",
    module: "term-sheet",
    blurb: "Binding terms issued, negotiated and signed."
  }
];

export const DEAL_STAGE_IDS = DEAL_STAGES.map((s) => s.id);

export const DEAL_STAGE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DECLINED", "ON_HOLD"];

// Stages that get their own sidebar entry and permission id. Zoom Call and
// Data Room are excluded: they already have richer purpose-built screens
// (Meetings, Data Room), and a second entry for each would be confusing.
export const DEAL_STAGE_MODULES = DEAL_STAGES.filter((s) => !["meetings", "data-room"].includes(s.module));
