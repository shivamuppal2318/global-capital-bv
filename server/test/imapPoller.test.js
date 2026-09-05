import { test } from "node:test";
import assert from "node:assert/strict";
import { nextFetchRange, deriveImapHost } from "../src/lib/imapPoller.js";

// --- deriveImapHost --------------------------------------------------------

test("deriveImapHost: mirrors smtp.<domain> as imap.<domain> for a generic provider", () => {
  assert.equal(deriveImapHost("smtp.hostinger.com"), "imap.hostinger.com");
});

test("deriveImapHost: prefixes imap. when the smtp host has no smtp. prefix to swap", () => {
  assert.equal(deriveImapHost("mail.example.com"), "imap.mail.example.com");
});

test("deriveImapHost: known providers use their real IMAP host, not the generic guess", () => {
  assert.equal(deriveImapHost("smtp.office365.com"), "outlook.office365.com");
  assert.equal(deriveImapHost("smtp-mail.outlook.com"), "outlook.office365.com");
  assert.equal(deriveImapHost("smtp.mail.yahoo.com"), "imap.mail.yahoo.com");
});

test("first ever run (no saved state) baselines to uidNext - 1, nothing to fetch yet", () => {
  const result = nextFetchRange({ uidValidity: "100", uidNext: 50, savedState: null });
  assert.equal(result.lastUid, 49);
  assert.equal(result.hasNew, false);
});

test("resumes from the saved lastUid when UIDVALIDITY matches", () => {
  const result = nextFetchRange({ uidValidity: "100", uidNext: 55, savedState: { uidValidity: "100", lastUid: 49 } });
  assert.equal(result.lastUid, 49);
  assert.equal(result.hasNew, true);
});

test("reports no new mail when uidNext hasn't advanced past the saved lastUid", () => {
  const result = nextFetchRange({ uidValidity: "100", uidNext: 50, savedState: { uidValidity: "100", lastUid: 49 } });
  assert.equal(result.hasNew, false);
});

test("a changed UIDVALIDITY discards the saved state and re-baselines fresh", () => {
  // Saved state is from a mailbox the server has since rebuilt (UIDVALIDITY
  // changed) -- its old lastUid=49 is meaningless now, so this must NOT
  // resume from it, even though it looks like a normal saved state.
  const result = nextFetchRange({ uidValidity: "200", uidNext: 12, savedState: { uidValidity: "100", lastUid: 49 } });
  assert.equal(result.lastUid, 11);
  assert.equal(result.hasNew, false);
});

test("does not rely on the IMAP \\Seen flag at all -- this is purely UID-range math", () => {
  // Regression guard for the actual bug this replaced: a real reply that a
  // human (or any other mail client with access to the same mailbox) had
  // already marked \Seen was permanently invisible to the old `{seen:
  // false}`-based poller. This function never looks at seen/unseen at
  // all -- only uidNext vs. the last uid this app itself remembers -- so a
  // message existing between lastUid+1 and uidNext-1 is always "new" to us
  // regardless of who else has looked at it.
  const result = nextFetchRange({ uidValidity: "100", uidNext: 200, savedState: { uidValidity: "100", lastUid: 130 } });
  assert.equal(result.hasNew, true);
  assert.equal(result.lastUid, 130);
});
