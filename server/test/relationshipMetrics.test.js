import { test } from "node:test";
import assert from "node:assert/strict";
import { ndaMetrics, callMetrics, visitMetrics } from "../src/lib/relationshipMetrics.js";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// --- NDA -----------------------------------------------------------------

test("ndaMetrics: empty input returns zeros and nulls, never NaN", () => {
  const m = ndaMetrics([]);
  assert.equal(m.sent, 0);
  assert.equal(m.signed, 0);
  assert.equal(m.avgSigningDays, null);
  assert.equal(m.reminderEffectiveness, null);
  assert.equal(m.signRate, null);
});

test("ndaMetrics: average signing time is the mean gap between sent and signed", () => {
  const m = ndaMetrics([
    { id: "a", status: "SIGNED", sentAt: daysAgo(10), signedAt: daysAgo(6) }, // 4 days
    { id: "b", status: "SIGNED", sentAt: daysAgo(8), signedAt: daysAgo(2) } //  6 days
  ]);
  assert.equal(m.signed, 2);
  assert.equal(m.avgSigningDays, 5);
});

test("ndaMetrics: a signed NDA with no sentAt is excluded from signing time, not counted as instant", () => {
  const m = ndaMetrics([
    { id: "a", status: "SIGNED", sentAt: daysAgo(4), signedAt: daysAgo(2) },
    { id: "b", status: "SIGNED", sentAt: null, signedAt: daysAgo(1) }
  ]);
  assert.equal(m.signed, 2, "both still count as signed");
  assert.equal(m.signedWithTiming, 1, "only one can be timed");
  assert.equal(m.avgSigningDays, 2);
});

test("ndaMetrics: declined and expired are not counted as pending", () => {
  const m = ndaMetrics([
    { id: "a", status: "SENT", sentAt: daysAgo(5), signedAt: null },
    { id: "b", status: "DECLINED", sentAt: daysAgo(9), signedAt: null },
    { id: "c", status: "EXPIRED", sentAt: daysAgo(40), signedAt: null }
  ]);
  assert.equal(m.pending, 1);
  assert.equal(m.declined, 1);
  assert.equal(m.expired, 1);
});

test("ndaMetrics: reminder effectiveness only credits signatures that came after the reminder", () => {
  const m = ndaMetrics([
    // Reminded, then signed — the reminder plausibly worked.
    { id: "a", status: "SIGNED", sentAt: daysAgo(20), reminder1At: daysAgo(10), signedAt: daysAgo(5) },
    // Signed BEFORE the reminder went out — the reminder can't take credit.
    { id: "b", status: "SIGNED", sentAt: daysAgo(20), reminder1At: daysAgo(3), signedAt: daysAgo(8) },
    // Reminded twice, still unsigned.
    { id: "c", status: "REMINDER_2", sentAt: daysAgo(30), reminder1At: daysAgo(20), reminder2At: daysAgo(10), signedAt: null }
  ]);
  assert.equal(m.remindersSent, 3);
  assert.equal(m.signedAfterReminder, 1);
  assert.equal(m.reminderEffectiveness, round1(1 / 3 * 100));
});

test("ndaMetrics: the chase list is ordered by longest wait first", () => {
  const m = ndaMetrics([
    { id: "recent", status: "SENT", sentAt: daysAgo(2), signedAt: null },
    { id: "stale", status: "REMINDER_1", sentAt: daysAgo(30), reminder1At: daysAgo(10), signedAt: null }
  ]);
  assert.equal(m.overdue[0].id, "stale");
  assert.equal(m.overdue[0].remindersSent, 1);
});

// --- Zoom calls ----------------------------------------------------------

test("callMetrics: uses the actual duration when present, falling back to the booked one", () => {
  const m = callMetrics([
    { status: "Completed", startTime: daysAgo(2), durationMinutes: 30, actualDurationMinutes: 50 },
    { status: "Completed", startTime: daysAgo(3), durationMinutes: 30, actualDurationMinutes: null }
  ]);
  assert.equal(m.completed, 2);
  assert.equal(m.avgDurationMinutes, 40, "(50 + 30) / 2");
});

test("callMetrics: follow-up and next-meeting rates are shares of completed calls", () => {
  const m = callMetrics([
    { status: "Completed", startTime: daysAgo(1), durationMinutes: 30, nextAction: "Send teaser", nextMeetingScheduled: true },
    { status: "Completed", startTime: daysAgo(2), durationMinutes: 30, nextAction: "  ", nextMeetingScheduled: false },
    { status: "Completed", startTime: daysAgo(3), durationMinutes: 30, nextMeetingScheduled: false }
  ]);
  assert.equal(m.followUpCreated, 1, "whitespace-only next action does not count");
  assert.equal(m.followUpRate, round1(1 / 3 * 100));
  assert.equal(m.nextMeetingRate, round1(1 / 3 * 100));
});

test("callMetrics: satisfaction averages only rated calls, ignoring unrated and zero", () => {
  const m = callMetrics([
    { status: "Completed", startTime: daysAgo(1), durationMinutes: 30, clientSatisfaction: 5 },
    { status: "Completed", startTime: daysAgo(2), durationMinutes: 30, clientSatisfaction: 4 },
    { status: "Completed", startTime: daysAgo(3), durationMinutes: 30, clientSatisfaction: null },
    { status: "Completed", startTime: daysAgo(4), durationMinutes: 30, clientSatisfaction: 0 }
  ]);
  assert.equal(m.ratedCount, 2);
  assert.equal(m.avgSatisfaction, 4.5);
});

test("callMetrics: a future meeting counts as upcoming, not completed", () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const m = callMetrics([{ status: "Scheduled", startTime: future, durationMinutes: 30 }]);
  assert.equal(m.completed, 0);
  assert.equal(m.upcoming, 1);
  assert.equal(m.avgDurationMinutes, null);
});

// --- Visit planning ------------------------------------------------------

test("visitMetrics: cost per visit averages only visits that recorded a cost", () => {
  const m = visitMetrics([
    { status: "COMPLETED", costAmount: 400, region: "Benelux" },
    { status: "COMPLETED", costAmount: 600, region: "Benelux" },
    { status: "COMPLETED", costAmount: null, region: "Benelux" }
  ]);
  assert.equal(m.visitsWithCost, 2);
  assert.equal(m.totalCost, 1000);
  assert.equal(m.costPerVisit, 500, "the costless visit must not drag the average down");
});

test("visitMetrics: cluster efficiency is the share of visits sharing a region", () => {
  const m = visitMetrics([
    { status: "PLANNED", region: "Benelux" },
    { status: "PLANNED", region: "Benelux" },
    { status: "PLANNED", region: "Benelux" },
    { status: "PLANNED", region: "MENA" } // a lone trip
  ]);
  assert.equal(m.clusterEfficiency, 75, "3 of 4 visits share a region");
  assert.deepEqual(m.regions[0], { region: "Benelux", count: 3 });
});

test("visitMetrics: cancelled visits are excluded from planned and from clustering", () => {
  const m = visitMetrics([
    { status: "PLANNED", region: "Benelux" },
    { status: "CANCELLED", region: "Benelux" }
  ]);
  assert.equal(m.planned, 1);
  assert.equal(m.cancelled, 1);
  assert.equal(m.clusterEfficiency, 0, "one remaining visit shares its region with nothing");
});

test("visitMetrics: report rate is a share of completed visits, not of all visits", () => {
  const m = visitMetrics([
    { status: "COMPLETED", reportSubmitted: true },
    { status: "COMPLETED", reportSubmitted: false },
    { status: "PLANNED", reportSubmitted: false }
  ]);
  assert.equal(m.reportsSubmitted, 1);
  assert.equal(m.reportRate, 50, "the not-yet-happened visit is not held against the rate");
});

test("visitMetrics: empty input returns nulls rather than NaN or division by zero", () => {
  const m = visitMetrics([]);
  assert.equal(m.planned, 0);
  assert.equal(m.costPerVisit, null);
  assert.equal(m.clusterEfficiency, null);
  assert.equal(m.reportRate, null);
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
