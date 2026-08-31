import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "./prisma.js";
import { recordReply } from "./replyRecorder.js";

const DEFAULT_POLL_INTERVAL_MS = 60_000;

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
    let messages;
    try {
      // Phase 1: fully drain the fetch generator into an array before
      // issuing any other command on the connection. Calling
      // messageFlagsAdd() while still iterating a live fetch() generator
      // deadlocks the IMAP connection (the FETCH command's response stream
      // is still open server-side when the STORE command gets issued) —
      // hit that hang for real, this two-phase split is the fix.
      messages = [];
      for await (const message of client.fetch({ seen: false }, { source: true, uid: true })) {
        messages.push(message);
      }
    } finally {
      lock.release();
    }

    // Phase 2: process each message and mark it seen, now that the fetch
    // command is fully closed out.
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
        // abort the whole poll and leave every other unseen message
        // unprocessed until the next cycle.
        console.error(`[imap-poller] failed to process message uid=${message.uid}:`, err.message);
      }

      // Mark seen regardless of outcome, so a message that isn't from a
      // known lead — or one that failed to process — doesn't get
      // re-fetched and re-parsed forever.
      const flagLock = await client.getMailboxLock("INBOX");
      try {
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      } finally {
        flagLock.release();
      }
    }
  } finally {
    await client.logout();
  }

  return { processedCount };
}
