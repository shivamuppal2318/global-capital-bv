import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "./prisma.js";
import { recordReply } from "./replyRecorder.js";
import { decryptSecret } from "./credentialCrypto.js";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const POLL_STATE_KEY_PREFIX = "imap_poll_uid_state";

// Well-known providers whose IMAP host doesn't follow the generic
// smtp.X -> imap.X pattern below. Extend this list rather than making the
// admin type an IMAP host by hand for a provider that's already common.
const KNOWN_IMAP_HOSTS = {
  "smtp.office365.com": "outlook.office365.com",
  "smtp-mail.outlook.com": "outlook.office365.com",
  "smtp.mail.yahoo.com": "imap.mail.yahoo.com"
};

// Lets adding a mailbox in Settings (POST /api/email-accounts) be the only
// configuration step — no separate IMAP_HOST env var to hand-edit on the
// server every time the watched mailbox changes (see EmailAccount's real
// smtpHost/smtpUser/smtpPassEncrypted, already stored for sending). Most
// hosting-provider mailboxes (Hostinger included) mirror their SMTP host as
// "imap.<same-domain>", which is what the fallback branch assumes when a
// provider isn't in the KNOWN_IMAP_HOSTS table above.
export function deriveImapHost(smtpHost) {
  if (KNOWN_IMAP_HOSTS[smtpHost]) return KNOWN_IMAP_HOSTS[smtpHost];
  return smtpHost.startsWith("smtp.") ? `imap.${smtpHost.slice("smtp.".length)}` : `imap.${smtpHost}`;
}

// Every active mailbox is watched, not just one — a second (or third)
// mailbox added in Settings previously never had its own inbox checked at
// all (only a single "shared company mailbox" account was ever polled), so
// real replies landing in any other configured mailbox sat there forever
// unseen. Each account gets its own IMAP connection and its own UID
// bookmark (see pollStateKey below) since UIDs aren't comparable across
// different mailboxes. Env vars still win when set (e.g. local dev without
// a database) and behave as a single synthetic watched account, same as
// before.
async function resolveWatchedAccounts() {
  if (process.env.IMAP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return [
      {
        id: "env",
        label: "Env-configured mailbox",
        host: process.env.IMAP_HOST,
        port: Number(process.env.IMAP_PORT ?? 993),
        secure: process.env.IMAP_SECURE !== "false",
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    ];
  }

  const accounts = await prisma.emailAccount.findMany({ where: { isActive: true }, orderBy: { updatedAt: "desc" } });
  return accounts.map((account) => ({
    id: account.id,
    label: account.label,
    host: deriveImapHost(account.smtpHost),
    port: 993,
    secure: true,
    user: account.smtpUser,
    pass: decryptSecret(account.smtpPassEncrypted)
  }));
}

// Persisted across restarts (the same generic key/value table AppSecret
// already uses for the JWT secret) so the poller's own notion of "already
// processed" survives a redeploy — unlike relying on the IMAP \Seen flag,
// this can't be silently invalidated by anything else with access to the
// same real mailbox (a human checking webmail, a phone's mail app) marking
// a lead's reply as read before the poller gets to it. That's not
// hypothetical: it's exactly how a real reply went permanently unprocessed
// on a shared company mailbox — seen by a person first, so `{seen: false}`
// never matched it again. Keyed per account (not one global key) since each
// mailbox has its own independent UID sequence.
function pollStateKey(accountId) {
  return `${POLL_STATE_KEY_PREFIX}:${accountId}`;
}

async function getPollState(accountId) {
  const row = await prisma.appSecret.findUnique({ where: { key: pollStateKey(accountId) } });
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function savePollState(accountId, state) {
  const key = pollStateKey(accountId);
  const value = JSON.stringify(state);
  await prisma.appSecret.upsert({
    where: { key },
    create: { key, value },
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

// This is what actually watches real mailboxes for replies — without it,
// POST /webhooks/inbound-email only ever fires if something calls it, and
// nothing did. Hostinger (and most plain hosting-provider mailboxes) don't
// have a "forward every incoming email to this URL" feature the way
// Postmark/SendGrid/Mailgun's inbound-parse products do, so polling over
// IMAP is the practical alternative for a mailbox like this one.
export async function isImapPollerEnabled() {
  return (await resolveWatchedAccounts()).length > 0;
}

let intervalHandle = null;

// Last poll's outcome, whether it ran on the automatic interval or was
// triggered manually (see fetchNow()) — this is what backs a real "Fetch
// Diagnostics" view instead of a button that just navigates away with
// nothing to show.
let lastPollResult = null;

export async function getImapStatus() {
  const accounts = await resolveWatchedAccounts();
  return {
    enabled: accounts.length > 0,
    accounts: accounts.map((a) => ({ label: a.label, user: a.user, host: a.host })),
    // Back-compat single-value fields for any caller expecting one mailbox
    // — the first watched account, so an old UI still gets a sensible
    // answer instead of undefined.
    host: accounts[0]?.host ?? null,
    watching: accounts[0]?.user ?? null,
    lastPoll: lastPollResult
  };
}

// Shared by every caller currently in flight — the automatic interval tick
// and a manual "Fetch Now" click can genuinely overlap (a slow IMAP
// round-trip still running when the next tick or another click fires), and
// without this both would fetch the exact same not-yet-bookmarked message
// range (the UID bookmark only advances at the very end of pollOnce) and
// both would call recordReply for it, sending the same real auto-response
// email to a lead twice. A concurrent call just awaits the same run instead
// of starting a second one.
let pollInFlight = null;

async function pollAndRecord() {
  if (pollInFlight) {
    return pollInFlight;
  }
  pollInFlight = (async () => {
    try {
      const { processedCount, perAccount } = await pollOnce();
      lastPollResult = { at: new Date().toISOString(), processedCount, error: null, perAccount };
      return { processedCount, perAccount };
    } catch (err) {
      lastPollResult = { at: new Date().toISOString(), processedCount: 0, error: err.message, perAccount: [] };
      throw err;
    } finally {
      pollInFlight = null;
    }
  })();
  return pollInFlight;
}

// The real action behind the Mailbox tab's "Fetch Now" button — previously
// that button only updated a client-side timestamp and never called the
// backend at all. Runs the exact same pollOnce() the automatic interval
// below uses, just on demand instead of waiting up to a minute for it.
export async function fetchNow() {
  if (!(await isImapPollerEnabled())) {
    throw Object.assign(new Error("No mailbox is configured to watch yet — add one in Settings, or set IMAP_HOST/SMTP_USER/SMTP_PASS."), { status: 409 });
  }
  return pollAndRecord();
}

// Always starts the interval loop, even with no mailbox configured yet —
// resolveWatchedAccounts() is re-checked on every single tick (see runPoll
// below), so adding a mailbox in Settings later starts real polling on the
// next tick automatically. No IMAP_HOST env var to hand-edit, and no
// backend restart, ever needed after the first deploy.
export function startImapPoller() {
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

  const runPoll = async () => {
    if (!(await isImapPollerEnabled())) return;
    await Promise.race([
      pollAndRecord(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`poll timed out after ${POLL_TIMEOUT_MS}ms`)), POLL_TIMEOUT_MS))
    ]).catch((err) => console.error("[imap-poller] poll failed:", err.message));
  };

  runPoll();
  intervalHandle = setInterval(runPoll, pollIntervalMs);
  console.log(`[imap-poller] started (checks every ${pollIntervalMs}ms for mailboxes to watch)`);
  return intervalHandle;
}

export function stopImapPoller() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// One mailbox's real poll — connects, fetches whatever's new since its own
// last remembered UID, records any reply matching a real lead, then
// bookmarks its own UID state. Isolated to just this account: an error here
// (bad password, unreachable host) is thrown to the caller, which isolates
// it per-account rather than letting one broken mailbox stop every other
// one from being checked (see pollOnce below).
async function pollAccount(account) {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.user, pass: account.pass },
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
    console.error(`[imap-poller] connection error (${account.label}):`, err.message);
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
      const savedState = await getPollState(account.id);
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
            // account.id is the synthetic string "env" for an env-var-configured
            // mailbox (see resolveWatchedAccounts) rather than a real
            // EmailAccount row — nothing to point the foreign key at in that
            // case, so it's recorded as null instead.
            await recordReply(lead, textBody, account.id === "env" ? null : account.id);
            processedCount += 1;
            console.log(`[imap-poller] processed reply from ${fromEmail} for lead ${lead.id} (${account.label})`);
          }
        }
      } catch (err) {
        // Isolated per message: a DB error or a malformed email shouldn't
        // abort the whole poll and leave every other new message
        // unprocessed until the next cycle.
        console.error(`[imap-poller] failed to process message uid=${message.uid} (${account.label}):`, err.message);
      }
    }

    // Advances past every message just examined, success or failure alike —
    // same "don't retry a permanently-broken message forever" tradeoff the
    // old \Seen-based marking made, just tracked ourselves now instead of a
    // flag anything else touching this real mailbox could mutate out from
    // under us.
    await savePollState(account.id, { uidValidity, lastUid: newLastUid });
  } finally {
    await client.logout();
  }

  return processedCount;
}

// Exported separately from the interval loop so it can be called directly
// for a one-off check/test without waiting for the interval. Polls every
// active mailbox, one at a time — isolated per account, so one broken
// mailbox (wrong password, host unreachable) doesn't stop the others from
// being checked.
export async function pollOnce() {
  const watchedAccounts = await resolveWatchedAccounts();
  if (!watchedAccounts.length) {
    throw new Error("No mailbox is configured to watch yet — add one in Settings, or set IMAP_HOST/SMTP_USER/SMTP_PASS.");
  }

  let processedCount = 0;
  const perAccount = [];
  for (const account of watchedAccounts) {
    try {
      const count = await pollAccount(account);
      processedCount += count;
      perAccount.push({ label: account.label, processedCount: count, error: null });
    } catch (err) {
      perAccount.push({ label: account.label, processedCount: 0, error: err.message });
    }
  }
  return { processedCount, perAccount };
}
