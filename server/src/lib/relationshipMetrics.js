// KPI maths for the NDA, Zoom Call and Visit Planning modules.
//
// Deliberately pure: these take plain arrays and return plain numbers, so
// every edge case (no records, missing dates, a signature that predates its
// own reminder) is testable without a database or a running server. The
// routes do nothing but fetch rows and hand them here.

const DAY_MS = 24 * 60 * 60 * 1000;

function round(n, places = 1) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

// --- NDA -----------------------------------------------------------------

export function ndaMetrics(records) {
  const sent = records.filter((r) => r.sentAt);
  const signed = records.filter((r) => r.signedAt);

  // "Pending" is deliberately narrower than "not signed": a declined or
  // expired NDA isn't waiting on anyone, and counting it as pending would
  // make the chase list permanently wrong.
  const pending = records.filter((r) => r.sentAt && !r.signedAt && !["DECLINED", "EXPIRED"].includes(r.status));

  // Only signatures with both timestamps can contribute — a signed record
  // missing sentAt would otherwise be counted as having taken until the
  // epoch to sign.
  const timed = signed.filter((r) => r.sentAt && r.signedAt >= r.sentAt);
  const avgSigningDays = timed.length
    ? round(timed.reduce((sum, r) => sum + (new Date(r.signedAt) - new Date(r.sentAt)) / DAY_MS, 0) / timed.length)
    : null;

  // Reminder effectiveness: of the NDAs that needed chasing, how many were
  // signed after the chase. Signatures that arrived before any reminder was
  // sent don't count — the reminder can't take credit for those.
  const reminded = records.filter((r) => r.reminder1At || r.reminder2At);
  const signedAfterReminder = reminded.filter((r) => {
    if (!r.signedAt) return false;
    const lastReminder = new Date(r.reminder2At ?? r.reminder1At);
    return new Date(r.signedAt) >= lastReminder;
  });

  return {
    sent: sent.length,
    signed: signed.length,
    pending: pending.length,
    declined: records.filter((r) => r.status === "DECLINED").length,
    expired: records.filter((r) => r.status === "EXPIRED").length,
    avgSigningDays,
    signedWithTiming: timed.length,
    remindersSent: reminded.length,
    signedAfterReminder: signedAfterReminder.length,
    reminderEffectiveness: reminded.length ? round((signedAfterReminder.length / reminded.length) * 100) : null,
    // Of everything sent, what share came back signed.
    signRate: sent.length ? round((signed.length / sent.length) * 100) : null,
    // Waiting longest first — this is the actual chase list.
    overdue: pending
      .map((r) => ({
        id: r.id,
        daysWaiting: Math.floor((Date.now() - new Date(r.sentAt)) / DAY_MS),
        remindersSent: [r.reminder1At, r.reminder2At].filter(Boolean).length
      }))
      .sort((a, b) => b.daysWaiting - a.daysWaiting)
  };
}

// --- Zoom calls ----------------------------------------------------------

export function callMetrics(meetings) {
  const now = Date.now();
  const completed = meetings.filter((m) => m.status === "Completed" || new Date(m.startTime) < now);

  // Prefer the recorded actual duration; fall back to what was booked.
  const withDuration = completed.filter((m) => m.actualDurationMinutes || m.durationMinutes);
  const avgDurationMinutes = withDuration.length
    ? Math.round(
        withDuration.reduce((sum, m) => sum + (m.actualDurationMinutes ?? m.durationMinutes), 0) / withDuration.length
      )
    : null;

  const withFollowUp = completed.filter((m) => m.nextAction && m.nextAction.trim());
  const withNextMeeting = completed.filter((m) => m.nextMeetingScheduled);
  const rated = completed.filter((m) => typeof m.clientSatisfaction === "number" && m.clientSatisfaction > 0);

  return {
    completed: completed.length,
    upcoming: meetings.length - completed.length,
    avgDurationMinutes,
    withNotes: completed.filter((m) => m.notes && m.notes.trim()).length,
    withRecording: completed.filter((m) => m.recordingLink).length,
    followUpCreated: withFollowUp.length,
    followUpRate: completed.length ? round((withFollowUp.length / completed.length) * 100) : null,
    nextMeetingScheduled: withNextMeeting.length,
    nextMeetingRate: completed.length ? round((withNextMeeting.length / completed.length) * 100) : null,
    ratedCount: rated.length,
    avgSatisfaction: rated.length
      ? round(rated.reduce((sum, m) => sum + m.clientSatisfaction, 0) / rated.length, 2)
      : null
  };
}

// --- Visit planning ------------------------------------------------------

export function visitMetrics(plans) {
  const planned = plans.filter((p) => p.status !== "CANCELLED");
  const completed = plans.filter((p) => p.status === "COMPLETED");

  const withCost = completed.filter((p) => typeof p.costAmount === "number" && p.costAmount > 0);
  const totalCost = withCost.reduce((sum, p) => sum + p.costAmount, 0);

  // Cluster efficiency: how much of the travel is to places we're already
  // going. A region visited once is a dedicated trip; a region visited five
  // times could share one. Expressed as the share of visits that sit in a
  // region with more than one visit — higher means less scattered travel.
  const byRegion = planned.reduce((acc, p) => {
    const key = (p.region || p.country || p.location || "Unspecified").trim();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const clustered = Object.values(byRegion).filter((n) => n > 1).reduce((a, b) => a + b, 0);

  return {
    planned: planned.length,
    completed: completed.length,
    cancelled: plans.filter((p) => p.status === "CANCELLED").length,
    upcoming: planned.filter((p) => p.plannedFor && new Date(p.plannedFor) > new Date()).length,
    completionRate: planned.length ? round((completed.length / planned.length) * 100) : null,
    totalCost: withCost.length ? round(totalCost, 2) : null,
    costPerVisit: withCost.length ? round(totalCost / withCost.length, 2) : null,
    visitsWithCost: withCost.length,
    regions: Object.entries(byRegion)
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count),
    clusterEfficiency: planned.length ? round((clustered / planned.length) * 100) : null,
    reportsSubmitted: completed.filter((p) => p.reportSubmitted).length,
    reportRate: completed.length
      ? round((completed.filter((p) => p.reportSubmitted).length / completed.length) * 100)
      : null
  };
}
