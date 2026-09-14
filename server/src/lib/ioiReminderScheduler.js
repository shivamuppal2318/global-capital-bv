import { prisma } from "../db.js";
import { advanceIoiRecord } from "./ioiActions.js";

// Same cadence/reasoning as NDA's own scheduler (ndaReminderScheduler.js):
// nudges chosen to land before Ageing Report's own IOI thresholds turn
// amber (20d) or red (40d), giving plenty of room before this shows up
// there as "at risk".
const REMINDER_1_AFTER_DAYS = 7;
const REMINDER_2_AFTER_DAYS = 7; // measured from reminder1At, not sentAt
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = DAY_MS;

// A record only ever matches ONE of these two queries at a time — reaching
// REMINDER_1 moves its status past the first query's own filter, so it
// can never receive the same reminder twice even if the sweep runs more
// than once in a day. No "already sent today" flag needed.
async function findDue() {
  const now = Date.now();
  const [dueForFirst, dueForSecond] = await Promise.all([
    prisma.ioiRecord.findMany({
      where: { status: "SENT", sentAt: { lte: new Date(now - REMINDER_1_AFTER_DAYS * DAY_MS) } }
    }),
    prisma.ioiRecord.findMany({
      where: { status: "REMINDER_1", reminder1At: { lte: new Date(now - REMINDER_2_AFTER_DAYS * DAY_MS) } }
    })
  ]);
  return [
    ...dueForFirst.map((record) => ({ record, action: "remind1" })),
    ...dueForSecond.map((record) => ({ record, action: "remind2" }))
  ];
}

// Real, deployed sweep — not a dry run. Each record is independent, so one
// failure just gets logged and skipped rather than aborting everyone
// else's reminder.
export async function runIoiReminderSweep() {
  const due = await findDue();
  let sent = 0;
  let failed = 0;
  for (const { record, action } of due) {
    try {
      const { emailResult } = await advanceIoiRecord(record, action);
      if (emailResult?.emailed) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[ioi-reminder-scheduler] ${action} failed for IOI record ${record.id}:`, err.message);
    }
  }
  if (due.length) {
    console.log(`[ioi-reminder-scheduler] sweep complete: ${due.length} due, ${sent} emailed, ${failed} not emailed/failed.`);
  }
  return { due: due.length, sent, failed };
}

export function startIoiReminderScheduler() {
  // Offset from the NDA scheduler's own startup delay so the two sweeps
  // don't both hit the DB in the same instant on every boot.
  setTimeout(() => {
    runIoiReminderSweep().catch((err) => console.error("[ioi-reminder-scheduler] sweep failed:", err.message));
    setInterval(() => {
      runIoiReminderSweep().catch((err) => console.error("[ioi-reminder-scheduler] sweep failed:", err.message));
    }, SWEEP_INTERVAL_MS);
  }, 45_000);
  console.log(`[ioi-reminder-scheduler] running every ${SWEEP_INTERVAL_MS}ms`);
}
