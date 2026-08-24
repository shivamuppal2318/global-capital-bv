import { test } from "node:test";
import assert from "node:assert/strict";
import { doeScorecard, whatsappReplyRateMetrics, zoomBookingMetrics } from "../src/lib/doeScorecard.js";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// --- doeScorecard ----------------------------------------------------------

test("doeScorecard: one row per distinct owner, unassigned leads excluded", () => {
  const leads = [
    { id: "1", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "2", owner: "Meera S", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "3", owner: null, replyType: "NO_REPLY", createdAt: daysAgo(1) }
  ];
  const rows = doeScorecard(leads, []);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.doe), ["Meera S", "Rahul R"], "sorted alphabetically");
});

test("doeScorecard: positive response rate counts INTERESTED and ZOOM_REQUEST, not INFO_REQUEST", () => {
  const leads = [
    { id: "1", owner: "Rahul R", replyType: "INTERESTED", createdAt: daysAgo(1) },
    { id: "2", owner: "Rahul R", replyType: "ZOOM_REQUEST", createdAt: daysAgo(1) },
    { id: "3", owner: "Rahul R", replyType: "INFO_REQUEST", createdAt: daysAgo(1) },
    { id: "4", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) }
  ];
  const [row] = doeScorecard(leads, []);
  assert.equal(row.positiveResponses, 2, "INFO_REQUEST is a real reply but not counted as positive");
  assert.equal(row.positiveResponseRate, 50);
});

test("doeScorecard: outreach/day divides by ACTIVE days, not the full calendar span", () => {
  // 6 leads, but only touched on 2 distinct days — a rep who works in
  // bursts shouldn't be scored as if they spread it over every day since.
  const leads = [
    { id: "1", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(20) },
    { id: "2", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(20) },
    { id: "3", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(20) },
    { id: "4", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "5", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "6", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) }
  ];
  const [row] = doeScorecard(leads, []);
  assert.equal(row.outreachSent, 6);
  assert.equal(row.outreachPerDay, 3, "6 leads over 2 active days");
});

test("doeScorecard: cold email open rate is measured against leads actually SENT to, not every assigned lead", () => {
  const leads = [
    { id: "1", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "2", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "3", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) } // queued, never sent
  ];
  const activity = [
    { leadId: "1", kind: "BULK_INTRO_SENT" },
    { leadId: "1", kind: "EMAIL_OPENED" },
    { leadId: "2", kind: "BULK_INTRO_SENT" }
    // lead 3 has no send activity at all
  ];
  const [row] = doeScorecard(leads, activity);
  assert.equal(row.emailsSent, 2, "only leads 1 and 2 were actually sent to");
  assert.equal(row.emailsOpened, 1);
  assert.equal(row.coldEmailOpenRate, 50, "1 of 2 SENT emails opened, not 1 of 3 assigned leads");
});

test("doeScorecard: a rep's activity never leaks into another rep's row", () => {
  const leads = [
    { id: "1", owner: "Rahul R", replyType: "NO_REPLY", createdAt: daysAgo(1) },
    { id: "2", owner: "Meera S", replyType: "NO_REPLY", createdAt: daysAgo(1) }
  ];
  const activity = [
    { leadId: "1", kind: "BULK_INTRO_SENT" },
    { leadId: "2", kind: "BULK_INTRO_SENT" },
    { leadId: "2", kind: "EMAIL_OPENED" }
  ];
  const rows = doeScorecard(leads, activity);
  const rahul = rows.find((r) => r.doe === "Rahul R");
  const meera = rows.find((r) => r.doe === "Meera S");
  assert.equal(rahul.emailsOpened, 0);
  assert.equal(meera.emailsOpened, 1);
});

test("doeScorecard: empty input returns an empty scorecard, not an error", () => {
  assert.deepEqual(doeScorecard([], []), []);
});

// --- whatsappReplyRateMetrics (company-wide) -----------------------------

test("whatsappReplyRateMetrics: aggregates across every agent", () => {
  const m = whatsappReplyRateMetrics([
    { assignedCount: 100, resolvedCount: 40 },
    { assignedCount: 50, resolvedCount: 30 }
  ]);
  assert.equal(m.totalAssigned, 150);
  assert.equal(m.totalResolved, 70);
  assert.equal(m.replyRate, round1((70 / 150) * 100));
});

test("whatsappReplyRateMetrics: no agents returns null, not a divide-by-zero", () => {
  assert.equal(whatsappReplyRateMetrics([]).replyRate, null);
});

// --- zoomBookingMetrics (company-wide) ------------------------------------

test("zoomBookingMetrics: per-day average uses distinct active days", () => {
  const m = zoomBookingMetrics([
    { createdAt: daysAgo(5) },
    { createdAt: daysAgo(5) },
    { createdAt: daysAgo(1) }
  ]);
  assert.equal(m.total, 3);
  assert.equal(m.perDay, 1.5, "3 meetings over 2 active days");
});

test("zoomBookingMetrics: empty input returns null, not NaN", () => {
  assert.equal(zoomBookingMetrics([]).perDay, null);
});

function round1(n) {
  return Math.round(n * 10) / 10;
}
