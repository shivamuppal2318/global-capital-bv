// Mirrors the client-side rules in src/App.jsx (replyRules / matchReplyRule).
// Kept in sync by hand for now; if this drifts, extract both into a shared
// package rather than letting the UI and the real classifier disagree.
export const replyRules = [
  { id: "nda", label: 'Reply contains "NDA"', keywords: ["nda", "sign"], replyType: "INTERESTED" },
  { id: "zoom", label: 'Reply contains "call/zoom"', keywords: ["zoom", "call", "meeting"], replyType: "ZOOM_REQUEST" },
  { id: "info", label: 'Reply contains "deck/details"', keywords: ["deck", "detail", "brochure", "info"], replyType: "INFO_REQUEST" }
];

export function matchReplyRule(text) {
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  return replyRules.find((rule) => rule.keywords.some((keyword) => lower.includes(keyword))) ?? null;
}

// Only ever called with a real, actually-received reply's text (see
// replyRecorder.js) -- "NO_REPLY" would be a lie here even when no
// keyword rule matches, since a reply plainly did happen. "OTHER" is the
// honest fallback: a genuine reply that just didn't match a recognized
// keyword (e.g. a plain "Ok"). NO_REPLY stays reserved for a lead's
// default DB value before any reply ever arrives.
export function classifyReply(text) {
  return matchReplyRule(text)?.replyType ?? "OTHER";
}
