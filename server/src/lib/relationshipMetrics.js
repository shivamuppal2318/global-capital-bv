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
  // A cancelled meeting whose scheduled time has passed is still cancelled,
  // not completed — without this exclusion it fell through the OR below and
  // got counted (and averaged into duration/satisfaction) as if it happened.
  const live = meetings.filter((m) => m.status !== "Cancelled");
  const cancelled = meetings.length - live.length;
  const completed = live.filter((m) => m.status === "Completed" || new Date(m.startTime) < now);

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
    upcoming: live.length - completed.length,
    cancelled,
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

// --- IOI -----------------------------------------------------------------

// Distribution helper: counts by a field, largest first, with blanks folded
// into a single "Unspecified" bucket rather than silently dropped — a
// distribution that hides its own gaps overstates how much is known.
function distribution(records, field) {
  const counts = records.reduce((acc, r) => {
    const key = (r[field] || "").trim() || "Unspecified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const total = records.length;
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count, share: total ? round((count / total) * 100) : null }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function ioiMetrics(records) {
  // "Generated" means the IOI exists as a real document, so drafts don't
  // count towards it — otherwise the number inflates with things nobody
  // has actually issued.
  const generated = records.filter((r) => r.status !== "DRAFT" || r.generatedAt);
  const signed = records.filter((r) => r.signedAt);

  // Only priced IOIs contribute to the average. An unpriced one is not a
  // zero-value indication, it is an unknown, and averaging it in as zero
  // would drag the figure down.
  const priced = generated.filter((r) => typeof r.value === "number" && r.value > 0);
  const totalValue = priced.reduce((sum, r) => sum + r.value, 0);

  return {
    generated: generated.length,
    signed: signed.length,
    declined: records.filter((r) => r.status === "DECLINED").length,
    pending: generated.filter((r) => !r.signedAt && !["DECLINED", "EXPIRED"].includes(r.status)).length,
    avgValue: priced.length ? round(totalValue / priced.length, 2) : null,
    totalValue: priced.length ? round(totalValue, 2) : null,
    pricedCount: priced.length,
    signRate: generated.length ? round((signed.length / generated.length) * 100) : null,
    // Distributions are over generated IOIs, not drafts: the question is
    // "where is our issued interest concentrated".
    byIndustry: distribution(generated, "industry"),
    byGeography: distribution(generated, "geography")
  };
}

// --- Deal funnel ---------------------------------------------------------

// NDA -> Zoom call -> Data room -> IOI -> Term sheet, counted as distinct
// leads that have reached each stage. Takes id lists rather than rows so
// the caller can union several sources (the dedicated tables plus the older
// shared DealStageRecord) without this function knowing about either.
export function dealFunnel({ nda = [], zoom = [], dataRoom = [], ioi = [], termSheet = [] } = {}) {
  const stages = [
    { key: "nda", label: "NDA", ids: nda },
    { key: "zoom", label: "Zoom call", ids: zoom },
    { key: "dataRoom", label: "Data room", ids: dataRoom },
    { key: "ioi", label: "IOI", ids: ioi },
    { key: "termSheet", label: "Term sheet", ids: termSheet }
  ];

  const counts = stages.map((s) => ({ ...s, count: new Set(s.ids).size }));
  const top = counts[0].count;

  return counts.map((s, i) => {
    const prev = i === 0 ? null : counts[i - 1].count;
    return {
      key: s.key,
      label: s.label,
      count: s.count,
      // Share of the top of the funnel — what the funnel graphic is drawn from.
      shareOfTop: top ? round((s.count / top) * 100) : null,
      // Conversion from the immediately preceding stage. Null at the top
      // (nothing precedes it) and when the previous stage is empty, rather
      // than a misleading 0% or a divide-by-zero.
      conversionFromPrevious: prev === null ? null : prev ? round((s.count / prev) * 100) : null,
      dropOff: prev === null ? null : Math.max(0, prev - s.count)
    };
  });
}
