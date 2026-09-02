import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "./prisma.js";
import { recordReply } from "./replyRecorder.js";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const POLL_STATE_KEY = "imap_poll_uid_state";

// Persisted across restarts (the same generic key/value table AppSecret
// already uses for the JWT secret) so the poller's own notion of "already
// processed" survives a redeploy — unlike relying on the IMAP \Seen flag,
// this can't be silently invalidated by anything else with access to the
// same real mailbox (a human checking webmail, a phone's mail app) marking
// a lead's reply as read before the poller gets to it. That's not
// hypothetical: it's exactly how a real reply went permanently unprocessed
// on a shared company mailbox — seen by a person first, so `{seen: false}`
// never matched it again.
async function getPollState() {
  const row = await prisma.appSecret.findUnique({ where: { key: POLL_STATE_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function savePollState(state) {
  const value = JSON.stringify(state);
  await prisma.appSecret.upsert({
    where: { key: POLL_STATE_KEY },
    create: { key: POLL_STATE_KEY, value },
    update: { value }
  });
}

// The actual decision of what to fetch this round, pulled out as a pure
// function so it's testable without a live IMAP connection. A changed (or
// missing) UIDVALIDITY means every UID previously remembered is meaningless
// — the server reassigned them, most commonly because the mailbox got
// rebuilt — so there's no safe range to resume from; start tracking fresh
// from whatever's already in the mailbox right now (uidNext - 1) rather
// than either replaying its entire history or misinterpreting stale UIDs
// as new mail.
export function nextFetchRange({ uidValidity, uidNext, savedState }) {
  const lastUid = savedState && savedState.uidValidity === uidValidity ? savedState.lastUid : uidNext - 1;
  return { lastUid, hasNew: uidNext - 1 > lastUid };
}

// This is what actually watches a real mailbox for replies — without it,
// POST /webhooks/inbound-email only ever fires if something calls it, and
// nothing did. Hostinger (and most plain hosting-provider mailboxes) don't
// have a "forward every incoming email to this URL" feature the way
// Postmark/SendGrid/Mailgun's inbound-parse products do, so polling over
// IMAP is the practical alternative for a mailbox like this one.
export function isImapPollerEnabled() {
  return Boolean(process.env.IMAP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let intervalHandle = null;

// Last poll's outcome, whether it ran on the automatic interval or was
// triggered manually (see fetchNow()) — this is what backs a real "Fetch
// Diagnostics" view instead of a button that just navigates away with
// nothing to show.
let lastPollResult = null;

export function getImapStatus() {
  return {
    enabled: isImapPollerEnabled(),
    host: process.env.IMAP_HOST ?? null,
    watching: process.env.SMTP_USER ?? null,
    lastPoll: lastPollResult
  };
}

async function pollAndRecord() {
  try {
    const { processedCount } = await pollOnce();
    lastPollResult = { at: new Date().toISOString(), processedCount, error: null };
    return { processedCount };
  } catch (err) {
    lastPollResult = { at: new Date().toISOString(), processedCount: 0, error: err.message };
    throw err;
  }
}

// The real action behind the Mailbox tab's "Fetch Now" button — previously
// that button only updated a client-side timestamp and never called the
// backend at all. Runs the exact same pollOnce() the automatic interval
// below uses, just on demand instead of waiting up to a minute for it.
export async function fetchNow() {
  if (!isImapPollerEnabled()) {
    throw Object.assign(new Error("IMAP is not configured (IMAP_HOST/SMTP_USER/SMTP_PASS)."), { status: 409 });
  }
  return pollAndRecord();
}

export function startImapPoller() {
  if (!isImapPollerEnabled()) {
    console.log("[imap-poller] IMAP_HOST/SMTP_USER/SMTP_PASS not fully set — poller not started.");
    return null;
  }
  if (intervalHandle) {
    return intervalHandle;
  }

  const pollIntervalMs = Number(process.env.IMAP_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);

  // A visibility net, not a true cancellation: Promise.race can't actually
  // kill a hung IMAP socket, so a stuck pollOnce() keeps running (and its
  // connection stays open) even after this logs and moves on — but it does
  // guarantee the interval loop keeps firing on schedule instead of silent
  // radio silence forever. Already hit one real IMAP protocol deadlock
  // during development (a STORE command issued while a FETCH stream was
  // still open — see the phase-1/phase-2 split below, which is the actual
  // fix for that case); this is a backstop against a *different* future
  // hang, not a substitute for fixing the root cause when one is found.
  const POLL_TIMEOUT_MS = 30_000;

  const runPoll = () => {
    Promise.race([
      pollAndRecord(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`poll timed out after ${POLL_TIMEOUT_MS}ms`)), POLL_TIMEOUT_MS))
    ]).catch((err) => console.error("[imap-poller] poll failed:", err.message));
  };

  runPoll();
  intervalHandle = setInterval(runPoll, pollIntervalMs);
  console.log(`[imap-poller] watching ${process.env.SMTP_USER} every ${pollIntervalMs}ms`);
  return intervalHandle;
}

export function stopImapPoller() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// Exported separately from the interval loop so it can be called directly
// for a one-off check/test without waiting for the interval.
export async function pollOnce() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    logger: false
  });

  // ImapFlow emits 'error' as a plain EventEmitter event (separate from any
  // promise rejection) whenever the underlying socket drops mid-session —
  // a transient DNS blip or network hiccup, not just a bad poll. Node
  // crashes the whole process on an unhandled 'error' event, and that's
  // exactly what happened here: one flaky lookup took down the entire
  // backend, not just this poll. A listener — even one that only logs —
  // is what stops that from being fatal.
  client.on("error", (err) => {
    console.error("[imap-poller] connection error:", err.message);
  });

  let processedCount = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    let messages = [];
    let uidValidity;
    let newLastUid;
    try {
      // Fully drain the fetch generator into an array before issuing any
      // other command on the connection — a lesson from the old \Seen-flag
      // version of this poller, which deadlocked issuing a STORE while a
      // FETCH stream was still open. Nothing here issues another command
      // mid-loop anymore (no more seen-marking), but keeping the same
      // drain-then-process shape costs nothing and stays safe if that ever
      // changes again.
      uidValidity = client.mailbox.uidValidity.toString();
      const uidNext = client.mailbox.uidNext;
      const savedState = await getPollState();
      const { lastUid, hasNew } = nextFetchRange({ uidValidity, uidNext, savedState });
      newLastUid = lastUid;

      if (hasNew) {
        for await (const message of client.fetch(`${lastUid + 1}:*`, { source: true, uid: true }, { uid: true })) {
          messages.push(message);
          if (message.uid > newLastUid) {
            newLastUid = message.uid;
          }
        }
      }
    } finally {
      lock.release();
    }

    for (const message of messages) {
      try {
        const parsed = await simpleParser(message.source);
        const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
        const textBody = parsed.text ?? "";

        if (fromEmail && textBody) {
          const lead = await prisma.emailLead.findFirst({ where: { email: fromEmail } });
          if (lead) {
            await recordReply(lead, textBody);
            processedCount += 1;
            console.log(`[imap-poller] processed reply from ${fromEmail} for lead ${lead.id}`);
          }
        }
      } catch (err) {
        // Isolated per message: a DB error or a malformed email shouldn't
        // abort the whole poll and leave every other new message
        // unprocessed until the next cycle.
        console.error(`[imap-poller] failed to process message uid=${message.uid}:`, err.message);
      }
    }

    // Advances past every message just examined, success or failure alike —
    // same "don't retry a permanently-broken message forever" tradeoff the
    // old \Seen-based marking made, just tracked ourselves now instead of a
    // flag anything else touching this real mailbox could mutate out from
    // under us.
    await savePollState({ uidValidity, lastUid: newLastUid });
  } finally {
    await client.logout();
  }

  return { processedCount };
}
