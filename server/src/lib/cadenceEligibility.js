// Decides whether a scheduled no-reply follow-up step should actually go
// out when its delay elapses. Without this check, a lead who replies on
// day 1 would still get the "Day 3 follow-up" and "Day 7 case study" steps
// blasted at them regardless — the whole point of a reply-triggered
// workflow (see App.jsx's buildWorkflowSteps) is that a reply should stop
// the no-reply cadence, not run alongside it.
export function isLeadEligibleForCadenceStep(lead) {
  if (lead.bounced) {
    return { eligible: false, reason: "bounced" };
  }
  if (lead.unsubscribed) {
    return { eligible: false, reason: "unsubscribed" };
  }
  if (lead.replyType && lead.replyType !== "NO_REPLY") {
    return { eligible: false, reason: `already replied (${lead.replyType})` };
  }
  return { eligible: true, reason: null };
}
