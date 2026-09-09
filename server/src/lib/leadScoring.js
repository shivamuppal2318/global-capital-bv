// Turns a lead's real tracked activity (opens/clicks/replies/NDA/calls/
// bounces — see EmailActivityKind in schema.prisma) into a 0-100 score, a
// band, and the reasons behind it. Every input here is something the system
// actually recorded happening — no fields are invented to make a lead look
// more or less engaged than it is.
export function calculateLeadScore({
  replyType = "NO_REPLY",
  bounced = false,
  bounceKind = null,
  unsubscribed = false,
  ndaSignedAt = null,
  callStatus = null,
  openCount = 0,
  clickCount = 0
} = {}) {
  const reasons = [];
  let score = 0;

  if (replyType !== "NO_REPLY") {
    score += 20;
    reasons.push("replied");
  }
  if (openCount > 0) {
    score += Math.min(20, openCount * 5);
    reasons.push(`${openCount} open${openCount === 1 ? "" : "s"}`);
  }
  if (clickCount > 0) {
    score += Math.min(25, clickCount * 12);
    reasons.push(`${clickCount} click${clickCount === 1 ? "" : "s"}`);
  }
  if (ndaSignedAt) {
    score += 30;
    reasons.push("NDA signed");
  }
  if (callStatus === "booked") {
    score += 15;
    reasons.push("call booked");
  }
  if (callStatus === "completed") {
    score += 25;
    reasons.push("call completed");
  }
  if (callStatus === "canceled") {
    score -= 10;
    reasons.push("call canceled");
  }
  if (bounced || bounceKind) {
    score -= 100;
    reasons.push(bounceKind === "HARD" ? "hard bounced" : "bounced");
  }
  if (unsubscribed) {
    score -= 100;
    reasons.push("unsubscribed");
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const atRisk = bounced || Boolean(bounceKind) || unsubscribed;
  const band = atRisk ? "risk" : normalized >= 60 ? "hot" : normalized >= 20 ? "warm" : "cold";

  return { score: normalized, band, reasons };
}

// The diagram's "Email validation: dedup, enrich, score, qualify or reject"
// step — qualification is a direct readout of the score band, not a
// separate judgment call, so it can never disagree with the score shown
// next to it.
export function deriveQualification(band) {
  if (band === "risk") return "rejected";
  if (band === "hot" || band === "warm") return "qualified";
  return "pending";
}
