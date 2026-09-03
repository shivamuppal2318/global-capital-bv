// Powers the Outreach/DOE screen: a per-rep ("Deal Originator Executive")
// productivity scorecard over the cold-email outreach engine.
//
// Deliberately scoped to what EmailLead + EmailActivityLog can actually
// attribute to a named rep. WhatsApp (Agent, a separate identity system
// with no link to EmailLead.owner) and Zoom (Meeting has no owner/rep
// column at all) cannot be broken out per DOE with the data this app
// currently captures — see whatsappReplyRate/zoomCallsPerDay below, both
// reported company-wide with that limitation stated rather than a number
// invented per rep. LinkedIn has no integration at all.
//
// Pure functions: plain arrays in, plain numbers out, no database.

import { outreachMetrics } from "./executiveMetrics.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEND_KINDS = new Set(["BULK_INTRO_SENT", "BRANCH_EMAIL_SENT", "CAMPAIGN_BLAST_SENT"]);

function round(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Distinct active calendar days a set of leads/activity touches — the
// denominator for "per day" rates. Using distinct active days rather than
// the full date range means a rep who worked 3 days out of a 30-day span
// isn't scored as if they underperformed on the other 27.
function activeDayCount(dates) {
  return new Set(dates.map(dayKey)).size;
}

// The three metrics that CAN be attributed to a rep, computed over
// whatever slice of leads/activity the caller passes in — one lead group
// for a single DOE's row, or every lead for a company-wide "All" total.
// "positive" replies are INTERESTED and ZOOM_REQUEST specifically —
// signals of real interest — while INFO_REQUEST is excluded because a
// request for more information is not the same as a positive signal, and
// folding it in would inflate the rate.
function attributableMetrics(leads, activityLogs) {
  const leadIds = new Set(leads.map((l) => l.id));
  const activity = activityLogs.filter((a) => leadIds.has(a.leadId));

  const sent = activity.filter((a) => SEND_KINDS.has(a.kind));
  const opened = new Set(activity.filter((a) => a.kind === "EMAIL_OPENED").map((a) => a.leadId));
  const positive = leads.filter((l) => ["INTERESTED", "ZOOM_REQUEST"].includes(l.replyType));

  const outreachSent = leads.length;
  const activeDays = activeDayCount(leads.map((l) => l.createdAt));

  return {
    outreachSent,
    outreachPerDay: activeDays ? round(outreachSent / activeDays) : null,
    positiveResponses: positive.length,
    positiveResponseRate: outreachSent ? round((positive.length / outreachSent) * 100) : null,
    emailsSent: sent.length,
    emailsOpened: opened.size,
    // Opens are measured against leads actually sent to, not against
    // every lead ever assigned — a lead still queued has had no chance
    // to open anything.
    coldEmailOpenRate: sent.length ? round((opened.size / sent.length) * 100) : null
  };
}

// One row per distinct EmailLead.owner.
export function doeScorecard(emailLeads, activityLogs) {
  const does = [...new Set(emailLeads.map((l) => l.owner).filter(Boolean))].sort();
  return does.map((doe) => ({
    doe,
    ...attributableMetrics(
      emailLeads.filter((l) => l.owner === doe),
      activityLogs
    )
  }));
}

// The same metrics, ungrouped — the "All DOEs" combined total.
export function doeOverallMetrics(emailLeads, activityLogs) {
  return attributableMetrics(emailLeads, activityLogs);
}

// Company-wide only — see the module comment for why WhatsApp reply rate
// can't be attributed to a DOE with the data this app currently links.
export function whatsappReplyRateMetrics(agents) {
  const totalAssigned = agents.reduce((sum, a) => sum + a.assignedCount, 0);
  const totalResolved = agents.reduce((sum, a) => sum + a.resolvedCount, 0);
  return {
    totalAssigned,
    totalResolved,
    // "Reply rate" here is resolved/assigned — the closest real proxy this
    // app tracks per WhatsApp agent; it is not a strict inbound-reply
    // count, which the Agent model doesn't separately record.
    replyRate: totalAssigned ? round((totalResolved / totalAssigned) * 100) : null
  };
}

// Company-wide only — Meeting has no rep/owner column, so a Zoom call
// booked can't be attributed to the DOE who originated the relationship.
export function zoomBookingMetrics(meetings) {
  const activeDays = activeDayCount(meetings.map((m) => m.createdAt));
  return {
    total: meetings.length,
    perDay: activeDays ? round(meetings.length / activeDays) : null
  };
}

// Re-exported so the route has one place to import the top-of-page KPI
// strip from — same definition the Executive Dashboard already uses, kept
// consistent rather than computing "outreach sent" two different ways.
export { outreachMetrics };
