import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveNdaStage,
  deriveZoomStage,
  deriveZoomStage2,
  deriveDataRoomStage,
  deriveIoiStage,
  deriveVisitStage,
  deriveDealStage,
  buildPortalStages,
  PORTAL_STAGES
} from "../src/lib/clientPortalStages.js";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// --- NDA -------------------------------------------------------------------

test("deriveNdaStage: no record at all is not_started", () => {
  assert.equal(deriveNdaStage(null).status, "not_started");
});

test("deriveNdaStage: a record that exists but hasn't been sent is still not_started", () => {
  // A DRAFT row with no sentAt shouldn't read as "in progress" to a client
  // who hasn't received anything yet.
  const s = deriveNdaStage({ status: "DRAFT", sentAt: null });
  assert.equal(s.status, "not_started");
});

test("deriveNdaStage: signed is completed, declined/expired are declined, otherwise in progress", () => {
  assert.equal(deriveNdaStage({ status: "SIGNED", sentAt: daysAgo(5), signedAt: daysAgo(1) }).status, "completed");
  assert.equal(deriveNdaStage({ status: "DECLINED", sentAt: daysAgo(5) }).status, "declined");
  assert.equal(deriveNdaStage({ status: "EXPIRED", sentAt: daysAgo(50) }).status, "declined");
  assert.equal(deriveNdaStage({ status: "REMINDER_1", sentAt: daysAgo(5) }).status, "in_progress");
});

// --- Zoom call ---------------------------------------------------------

test("deriveZoomStage: no meetings at all is not_started", () => {
  assert.equal(deriveZoomStage([]).status, "not_started");
});

test("deriveZoomStage: any completed call is completed, using the MOST RECENT one", () => {
  const s = deriveZoomStage([
    { status: "Completed", startTime: daysAgo(20) },
    { status: "Completed", startTime: daysAgo(2) }
  ]);
  assert.equal(s.status, "completed");
  assert.ok(s.detail.includes(new Date(daysAgo(2)).toLocaleDateString()));
});

test("deriveZoomStage: an upcoming scheduled call (no completed ones) is in_progress", () => {
  const s = deriveZoomStage([{ status: "Scheduled", startTime: daysFromNow(3) }]);
  assert.equal(s.status, "in_progress");
});

test("deriveZoomStage: only a cancelled call is not_started, not in_progress", () => {
  const s = deriveZoomStage([{ status: "Cancelled", startTime: daysAgo(5) }]);
  assert.equal(s.status, "not_started");
});

// --- Zoom call 2 ---------------------------------------------------------

test("deriveZoomStage2: fewer than two meetings is not_started, even with one completed", () => {
  assert.equal(deriveZoomStage2([]).status, "not_started");
  assert.equal(deriveZoomStage2([{ status: "Completed", startTime: daysAgo(5) }]).status, "not_started");
});

test("deriveZoomStage2: reports on the chronologically SECOND meeting, not just any second entry", () => {
  // Out of input order on purpose: the function must sort by date itself.
  const s = deriveZoomStage2([
    { status: "Completed", startTime: daysAgo(2) },
    { status: "Completed", startTime: daysAgo(10) }
  ]);
  assert.equal(s.status, "completed");
  assert.ok(s.detail.includes(new Date(daysAgo(2)).toLocaleDateString()), "the SECOND chronologically is the more recent one");
});

test("deriveZoomStage2: an upcoming second call is in_progress", () => {
  const s = deriveZoomStage2([
    { status: "Completed", startTime: daysAgo(10) },
    { status: "Scheduled", startTime: daysFromNow(4) }
  ]);
  assert.equal(s.status, "in_progress");
});

// --- Data Room -----------------------------------------------------------

test("deriveDataRoomStage: partial vs full checklist completion", () => {
  assert.equal(deriveDataRoomStage({ receivedCount: 0, totalRequired: 10 }).status, "not_started");
  assert.equal(deriveDataRoomStage({ receivedCount: 4, totalRequired: 10 }).status, "in_progress");
  assert.equal(deriveDataRoomStage({ receivedCount: 10, totalRequired: 10 }).status, "completed");
});

// --- IOI -------------------------------------------------------------------

test("deriveIoiStage: not yet generated is not_started", () => {
  assert.equal(deriveIoiStage(null).status, "not_started");
  assert.equal(deriveIoiStage({ status: "DRAFT", generatedAt: null }).status, "not_started");
});

test("deriveIoiStage: generated but not sent is still in_progress, distinctly worded", () => {
  const s = deriveIoiStage({ status: "GENERATED", generatedAt: daysAgo(2), sentAt: null });
  assert.equal(s.status, "in_progress");
  assert.match(s.detail, /not yet sent/i);
});

test("deriveIoiStage: signed completes it, declined/expired are declined", () => {
  assert.equal(deriveIoiStage({ status: "SIGNED", generatedAt: daysAgo(5), sentAt: daysAgo(4), signedAt: daysAgo(1) }).status, "completed");
  assert.equal(deriveIoiStage({ status: "DECLINED", generatedAt: daysAgo(5), sentAt: daysAgo(4) }).status, "declined");
});

// --- Visit planning ------------------------------------------------------

test("deriveVisitStage: a completed visit wins over an unrelated cancelled one", () => {
  const s = deriveVisitStage([
    { status: "CANCELLED", plannedFor: daysAgo(10) },
    { status: "COMPLETED", completedAt: daysAgo(3), location: "Rotterdam HQ" }
  ]);
  assert.equal(s.status, "completed");
  assert.match(s.detail, /Rotterdam HQ/);
});

test("deriveVisitStage: with no completed visit, the NEAREST upcoming one is reported", () => {
  const s = deriveVisitStage([
    { status: "PLANNED", plannedFor: daysFromNow(20) },
    { status: "PLANNED", plannedFor: daysFromNow(3) }
  ]);
  assert.equal(s.status, "in_progress");
});

// --- Field Visit / Term Sheet (shared DealStageRecord shape) ------------

test("deriveDealStage: NOT_STARTED/ON_HOLD/IN_PROGRESS/COMPLETED/DECLINED map correctly", () => {
  assert.equal(deriveDealStage(null).status, "not_started");
  assert.equal(deriveDealStage({ status: "NOT_STARTED" }).status, "not_started");
  assert.equal(deriveDealStage({ status: "ON_HOLD" }).status, "in_progress");
  assert.equal(deriveDealStage({ status: "IN_PROGRESS" }).status, "in_progress");
  assert.equal(deriveDealStage({ status: "COMPLETED", completedAt: daysAgo(1) }).status, "completed");
  assert.equal(deriveDealStage({ status: "DECLINED" }).status, "declined");
});

// --- buildPortalStages ---------------------------------------------------

test("buildPortalStages: returns all 8 stages in a fixed order, even with nothing but nulls", () => {
  const stages = buildPortalStages({
    nda: null,
    meetings: [],
    dataRoom: { receivedCount: 0, totalRequired: 10 },
    ioi: null,
    visits: [],
    fieldVisit: null,
    termSheet: null
  });
  assert.equal(stages.length, 8);
  assert.deepEqual(stages.map((s) => s.key), PORTAL_STAGES.map((s) => s.key));
  assert.ok(stages.every((s) => s.status === "not_started"));
});

test("buildPortalStages: Zoom Call 2 sits right after IOI, before Visit Planning", () => {
  const keys = PORTAL_STAGES.map((s) => s.key);
  assert.deepEqual(keys.slice(3, 5), ["ioi", "zoom2"]);
  assert.equal(keys[5], "visitPlanning");
});
