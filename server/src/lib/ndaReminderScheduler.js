import { prisma } from "../db.js";
import { advanceNdaRecord } from "./ndaActions.js";

// Nudges chosen to land before Ageing Report's own NDA thresholds turn
// amber (7d) or red (15d) — a rep sees the reminder already went out
// automatically before this shows up as "at risk" on that report, rather
// than the two disagreeing about what "on time" means for the same record.
const REMINDER_1_AFTER_DAYS = 5;
const REMINDER_2_AFTER_DAYS = 5; // measured from reminder1At, not sentAt
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = DAY_MS;

// A record only ever matches ONE of these two queries at a time — reaching
// REMINDER_1 moves its status past the first query's own filter, so a
// record can never receive the same reminder twice even if the sweep runs
// more than once in a day (a restart, for instance). No "already sent
// today" flag needed; the status transition itself is what makes this
// safe to re-run.
async function findDue() {
  const now = Date.now();
  const [dueForFirst, dueForSecond] = await Promise.all([
    prisma.ndaRecord.findMany({
      where: { status: "SENT", sentAt: { lte: new Date(now - REMINDER_1_AFTER_DAYS * DAY_MS) } }
    }),
    prisma.ndaRecord.findMany({
      where: { status: "REMINDER_1", reminder1At: { lte: new Date(now - REMINDER_2_AFTER_DAYS * DAY_MS) } }
    })
  ]);
  return [
    ...dueForFirst.map((record) => ({ record, action: "remind1" })),
    ...dueForSecond.map((record) => ({ record, action: "remind2" }))
  ];
}

// Real, deployed sweep — not a dry run. Each record is fully independent
// (same "one bad row doesn't block the rest" reasoning as every other bulk
// job in this codebase), so one failure just gets logged and skipped
// rather than aborting everyone else's reminder.
export async function runNdaReminderSweep() {
  const due = await findDue();
  let sent = 0;
  let failed = 0;
  for (const { record, action } of due) {
    try {
      const { emailResult } = await advanceNdaRecord(record, action);
      if (emailResult?.emailed) sent += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[nda-reminder-scheduler] ${action} failed for NDA record ${record.id}:`, err.message);
    }
  }
  if (due.length) {
    console.log(`[nda-reminder-scheduler] sweep complete: ${due.length} due, ${sent} emailed, ${failed} not emailed/failed.`);
  }
  return { due: due.length, sent, failed };
}

export function startNdaReminderScheduler() {
  // A short delay after boot, same reasoning as anything else that touches
  // the DB at startup — let the connection pool and admin bootstrap finish
  // first rather than racing them.
  setTimeout(() => {
    runNdaReminderSweep().catch((err) => console.error("[nda-reminder-scheduler] sweep failed:", err.message));
    setInterval(() => {
      runNdaReminderSweep().catch((err) => console.error("[nda-reminder-scheduler] sweep failed:", err.message));
    }, SWEEP_INTERVAL_MS);
  }, 30_000);
  console.log(`[nda-reminder-scheduler] running every ${SWEEP_INTERVAL_MS}ms`);
}
