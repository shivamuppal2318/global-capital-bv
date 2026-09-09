// Shared by every path that creates a Lead (routes/leads.js's inbound
// webhook, "New record", CSV import, and email-lead conversion, plus the
// automatic INTERESTED-reply conversion in replyRecorder.js) so the same
// defaults (status, tone, engagementStage, initials) can never drift apart
// between them. Split out of routes/leads.js so lib/replyRecorder.js can
// reuse it too, without a lib module importing a route module.

function toInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TONES = ["blue", "amber", "green", "violet", "sky"];

// status defaults to "NEW" — pass "INTERESTED" for the one path (an
// auto-converted, reply-classified-INTERESTED cold contact) that shouldn't
// start at the very bottom of the pipeline like a lead nobody has heard
// from yet.
export function buildLeadCreateData({ name, company, email, mobile, capitalAsk, owner, leadSource, territory, notes, rawPayload, status }) {
  return {
    initials: toInitials(name),
    name,
    company: company || "—",
    email: email || null,
    mobile: mobile || null,
    capitalAsk: capitalAsk || "Not specified",
    owner: owner || null,
    leadSource: leadSource || "Manual entry",
    territory: territory || null,
    notes: notes || null,
    status: status || "NEW",
    qualified: false,
    tone: TONES[Math.floor(Math.random() * TONES.length)],
    engagementStage: "Initial outreach",
    rawPayload: rawPayload ?? {}
  };
}
