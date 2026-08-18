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

export function classifyReply(text) {
  return matchReplyRule(text)?.replyType ?? "NO_REPLY";
}
