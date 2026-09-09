// Pure matching logic for Segments (Email Automation → Segments tab) — kept
// free of Prisma so it's testable with plain objects and reusable both for
// computing a saved segment's live matchingCount and for a not-yet-saved
// segment being previewed in the UI.

// The fixed field vocabulary a condition can target — deliberately mapped to
// real EmailLead columns (see schema.prisma) rather than the placeholder
// options ("Status", "Source", "City") the original mockup had, which didn't
// correspond to anything the backend actually stores.
export const SEGMENT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: "country", label: "Country" },
  { key: "replyType", label: "Reply Type" }
];

export const SEGMENT_OPERATORS = [
  { key: "contains", label: "Contains" },
  { key: "equals", label: "Equals" },
  { key: "startsWith", label: "Starts with" },
  { key: "endsWith", label: "Ends with" }
];

const VALID_FIELD_KEYS = new Set(SEGMENT_FIELDS.map((f) => f.key));
const VALID_OPERATOR_KEYS = new Set(SEGMENT_OPERATORS.map((o) => o.key));

function fieldValue(lead, field) {
  const raw = lead?.[field];
  return raw == null ? "" : String(raw);
}

// A condition missing a field/operator we recognize, or with a blank value,
// can't meaningfully filter anything — usableConditions below drops these
// rather than letting them silently exclude every lead (a half-filled-in
// condition row in the UI shouldn't zero out the whole segment).
function isUsableCondition(condition) {
  return Boolean(condition) && VALID_FIELD_KEYS.has(condition.field) && VALID_OPERATOR_KEYS.has(condition.operator) && Boolean(condition.value?.trim());
}

export function evaluateCondition(lead, condition) {
  const haystack = fieldValue(lead, condition.field).toLowerCase();
  const needle = condition.value.trim().toLowerCase();
  switch (condition.operator) {
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    case "contains":
    default:
      return haystack.includes(needle);
  }
}

// No usable conditions (a brand-new segment, or one whose rows are all still
// blank) matches every lead in scope — same as "no filter applied yet",
// rather than matching none.
export function leadMatchesSegment(lead, segment) {
  const usable = (Array.isArray(segment.conditions) ? segment.conditions : []).filter(isUsableCondition);
  if (usable.length === 0) return true;

  return segment.matchType === "ANY" ? usable.some((c) => evaluateCondition(lead, c)) : usable.every((c) => evaluateCondition(lead, c));
}

export function filterMatchingLeads(leads, segment) {
  return leads.filter((lead) => leadMatchesSegment(lead, segment));
}
