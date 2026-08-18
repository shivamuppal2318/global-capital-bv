# Global Capital CRM — backend

Real email-sending architecture for the CRM prototype in `../src`. This is a
separate Node service, not part of the Vite frontend build.

## Real end-to-end verification (SQLite, one-off)

Every feature below had, until this point, only ever been proven via
graceful-fallback behavior (correct error codes, no crashes) — never a real
success path through a database, since no Postgres was available in this
environment. Rather than leave that untested indefinitely, ran one careful,
fully-reversible experiment: temporarily pointed the schema at a local
SQLite file (no Docker/cloud account needed), ran real migrations, seeded
it, and exercised the actual running server against real data. **Confirmed
working for real, not just unit-tested**: campaign creation, lead listing,
template CRUD + preview, the full send pipeline (spam check, daily cap,
unsubscribe/NDA link generation, activity logging), the closed
reply-classify-auto-respond loop end-to-end, the NDA e-signature flow
(GET the page → POST a signature → confirmed it persisted and flipped the
lead's stage), bounce-triggered suppression (confirmed a subsequent send
attempt correctly got refused), CSV bulk import, and EmailAccount creation
with confirmed-real password encryption at rest. One genuine
SQLite-only limitation surfaced (not an app bug): Prisma's `mode:
"insensitive"` filter — used by the market-intelligence company matcher —
isn't supported outside Postgres/MongoDB, so that one path wasn't exercised
this way. Schema was restored to `postgresql` and the client regenerated
immediately after; nothing here changes how the app runs normally.

## What's here

- **Market intelligence engine** (`src/lib/marketIntelligence/`) —
  architecture only, built to spec against a flowchart, with **zero of the
  five required external accounts available** (NewsAPI.ai, Exa Search,
  Firecrawl, Apollo, and an LLM for AI processing). Honest breakdown of
  what that means:
  - **Fully real and tested**: the pipeline's control flow (fetch → dedup →
    AI-process → route to an existing lead or create a new one), every
    source's response-normalization function, the dedup hash, the
    AI-response prompt-building and parsing, and the company-matching
    query — all pure/DI-testable logic, 42 unit tests, all passing.
    **Verified live**: ran the actual pipeline function with everything
    unconfigured and confirmed it correctly skips every source and returns
    a clean summary instead of throwing; hit `POST /market-intelligence/run`
    and `GET /market-intelligence/status` on a running server and got
    exactly that same behavior end-to-end (200, not a crash).
  - **Apollo enrichment is a full company profile, not just a contact**:
    `apolloLookupCompany()` feeds the AI-extracted entity name into Apollo
    and pulls back industry, estimated employee count, estimated annual
    revenue, founded year, headquarters location, and LinkedIn URL —
    alongside a contact — instead of only a name+email. `createLeadFromSignal`
    now actually records this on the new lead's activity timeline
    (`summarizeApolloEnrichment()`) — previously the enrichment was fetched,
    used for one contact field, and then silently discarded.
  - **Not real yet, by necessity**: every external network call (NewsAPI.ai
    article search, Exa search, Firecrawl scrape, Apollo org/people search,
    the actual Claude API call) is written from public docs but **never
    executed against a live API** — no account exists here for any of the
    four data sources or the LLM. Endpoint URLs and response shapes are
    best-effort and explicitly flagged in each file's header comment as
    unverified; expect to adjust each source's `normalize*()` function
    once real API keys are added and you see the actual response.
  - **Company matching is now two-pass**: exact case-insensitive match
    first (cheap, common case), then a fuzzy fallback
    (`lib/marketIntelligence/companyNameMatch.js` — strips legal suffixes
    like Inc/Ltd/GmbH/BV, then Levenshtein similarity, threshold 0.85) so
    "Acme Inc" and "Acme, Incorporated" — or a minor typo — still match,
    while "Acme Corp" and "Acme Industries" (genuinely different companies
    sharing a word) correctly don't. There's still no normalized `Company`
    entity, and the fuzzy pass scans every lead in memory rather than using
    a database-side trigram index — fine at prototype scale, not at
    thousands of leads.
  - **Now has an automatic scheduler**
    (`lib/marketIntelligence/scheduler.js`) — runs the pipeline on an
    interval (`MARKET_INTELLIGENCE_INTERVAL_MS`, default 6h) instead of
    only via manual `POST /run`. Mirrors `imapPoller.js`'s start/stop
    pattern. Only starts if at least one of the three fetch sources is
    configured — verified live that it correctly does nothing (not even an
    initial run) when none are, same as every other "gracefully inert
    until configured" integration in this codebase.
  - `GET /market-intelligence/status` reports which of the five services
    are configured; `POST /market-intelligence/run` triggers a pipeline
    run manually; `GET /market-intelligence/signals` lists captured
    `MarketSignal` rows.
  - **Frontend page now exists** (`../src/App.jsx`'s `MarketIntelligencePage`,
    wired to the previously-orphaned "Market Intelligence" sidebar item,
    which fell through to a generic placeholder before this) — service
    status grid, a "Run pipeline now" button, and a captured-signals table.
    Verified live in-browser: correct page title (was silently showing
    stale Command Center copy before), and every piece degrades to a clear
    "backend unreachable" state rather than breaking when the API's down.

- **Express API** (`src/index.js` + `src/routes/*`) — campaigns, lead
  activity, immediate sends, cadence scheduling, inbound-reply webhook.
- **Prisma schema** (`prisma/schema.prisma`) — Postgres models replacing the
  frontend's in-memory `useState` (leads, campaigns, reply events, activity
  log, templates).
- **Multiple SMTP accounts** (`EmailAccount` model + `src/routes/emailAccounts.js`
  + `src/lib/credentialCrypto.js`) — previously exactly one SMTP identity
  existed (whatever was in `.env`), shared by every campaign. Now you can
  register as many mailboxes as you want via `POST /email-accounts` and
  assign each campaign to one via `POST /campaigns/:id/email-account`
  (unassigned campaigns keep using the original global env-configured
  provider — fully backward compatible). Passwords are stored as
  AES-256-GCM ciphertext, never plaintext (`ENCRYPTION_KEY`); `smtpPassEncrypted`
  is redacted from every API response, and every unit test proves the
  crypto round-trips correctly, detects tampering (auth tag), and fails
  loudly on a wrong key — not just that it "looks encrypted." Deleting an
  account in use by a campaign is blocked (409); deactivating one is the
  intended way to retire a mailbox without breaking campaigns still
  pointing at it.
  **Verified for real, not just unit-tested in isolation**: sent through
  two genuinely different SMTP accounts — the real Hostinger mailbox and a
  freshly-minted Ethereal test account, different host/credentials for
  each — **concurrently**, and confirmed two distinct message IDs came back
  from two distinct connections. `sendTemplateEmail`/`sendRawEmail`
  (`leadSender.js`) and the cadence worker both resolve the provider from
  the lead's *own* campaign per-send now, not a single provider grabbed
  once — the worker previously cached one global provider at startup, which
  would have silently ignored any campaign-specific account.
  - **Per-account daily cap** (`src/lib/accountSendCap.js`) — closes a real
    gap from the first cut of this feature: `sendCap.js`'s cap is per
    *campaign*, so two campaigns sharing one mailbox could jointly blast
    past that mailbox's actual provider-side limit even though each
    campaign individually stayed under its own configured cap. Both
    `leadSender.js` (immediate sends) and the cadence worker now check the
    account-level cap too, 429ing with a message naming the shared mailbox
    specifically. 5 unit tests, same injectable-client pattern as `sendCap.js`.
  - **Frontend** (Cold Bulk Mailing page): a "Sending mailboxes" card to
    register accounts and deactivate them, plus a per-campaign dropdown
    ("Selected campaign" panel) to assign one — was pure backend with zero
    UI until this pass. Verified live: renders, submits, and falls back
    gracefully when the backend's unreachable (confirmed via the same
    graceful-fallback pattern as every other write action in this app).
- **Email provider abstraction** (`src/lib/emailProvider.js`) — `dev`
  provider logs to console by default. `smtp` is fully implemented (via
  `nodemailer`) and actually sends — verified end-to-end against an Ethereal
  test SMTP server, including confirming the delivered subject/to/body match.
  Works against any SMTP-compatible service (your own relay, Gmail app
  password, or SES/Postmark/Mailgun/SendGrid's own SMTP endpoints).
  `ses`/`postmark` API-based providers are stubbed and throw until someone
  wires in their SDK — use `EMAIL_PROVIDER=smtp` against their SMTP endpoint
  in the meantime if you want a working provider today.
- **Templates** (`prisma` `Template` model + `src/routes/templates.js` +
  `src/lib/renderTemplate.js`) — persisted, reusable subject/body/html per
  reply type, with `{{leadName}}`/`{{company}}`/`{{unsubscribeUrl}}` merge
  fields. Plain-text templates are auto-wrapped in a branded HTML shell with
  a real (not decorative) unsubscribe link — `GET /unsubscribe/:leadId`
  actually flips `Lead.unsubscribed`, and every send path checks that flag
  and refuses to send (409) if set. `POST /leads/:id/send-template` sends by
  template key; `POST /leads/:id/send` still takes raw subject/body for
  hand-edited one-offs. Verified end-to-end via a real Ethereal SMTP send —
  confirmed the delivered MIME source actually carries the HTML part with
  the merged name/company and a working unsubscribe href, not just that the
  code compiles.
  - `GET /templates/:key/preview` — renders a template with sample
    placeholder data (merge fields filled, HTML wrapped/branded exactly
    like a real send) so the UI can show what an email actually looks like
    before it goes to a real lead. Wired to a "Preview" button in the Cold
    Bulk Mailing email draft editor (opens the rendered HTML in a
    sandboxed iframe).
  - `DELETE /templates/:key` — blocks deleting the four reply-type keys
    (`interested`/`zoom-request`/`info-request`/`no-reply`) that
    `autoRespond.js` depends on; deleting one wouldn't error loudly, the
    next auto-response for that reply type would just silently fail to
    send. Verified live: deleting `interested` returns 409 before the
    request ever reaches the database.
  - The "Templates & Cadences" sidebar page's template table now loads
    real data from `GET /templates` (falls back to the original mock rows
    if the backend's unreachable, verified in-browser) — previously 100%
    disconnected mockup. The Cadences panel next to it is still mock data:
    `CadenceStep` rows live per-campaign server-side, there's no "all
    cadences across every campaign" endpoint yet to back a flat list.
- **Reply classifier** (`src/lib/replyClassifier.js`) — a hand-kept port of
  the `replyRules`/`matchReplyRule` logic in `../src/App.jsx`, used to
  classify real replies the same way the UI's rule chips classify text.
- **The actual closed loop: reply arrives → auto-classified → auto-sent,
  zero clicks.** Three pieces, all new:
  - `src/lib/imapPoller.js` — actually watches the real mailbox. Hostinger
    (like most plain hosting-provider mailboxes) has no "forward every
    incoming email to a URL" feature the way Postmark/SendGrid/Mailgun's
    inbound-parse products do, so this polls over IMAP instead
    (`IMAP_HOST`/`_PORT`/`_SECURE`/`_POLL_INTERVAL_MS`, reuses
    `SMTP_USER`/`SMTP_PASS` as the mailbox login). Verified against the real
    `globalcapitalbv.com` inbox — and hit a real bug doing it: issuing a
    flag-update command while still iterating a live IMAP `fetch()`
    generator deadlocks the connection (a protocol-sequencing gotcha, not a
    logic bug). Fixed by draining the fetch into an array first, then
    processing/flagging each message in a separate pass. Also has a 30s
    watchdog timeout around each poll cycle as a backstop against a
    *different* future hang — logged as a visibility net, not a true
    cancellation (a stuck IMAP socket can't actually be killed from here).
  - `src/lib/autoRespond.js` — maps a classified reply straight to its
    template (`INTERESTED` → `interested`/NDA, `ZOOM_REQUEST` →
    `zoom-request`/Calendly, `INFO_REQUEST` → `info-request`) and sends it
    via the same `sendTemplateEmail` the manual "Send" button uses — same
    suppression checks, same daily cap, same deliverability warnings. A
    failed auto-send (unsubscribed, bounced, capped) is reported, not
    thrown — the reply itself was still real and worth recording.
  - `src/lib/replyRecorder.js`'s `recordReply()` now calls the
    auto-responder immediately after classifying — this is what the
    webhook, the IMAP poller, **and** the frontend's "Simulate reply"
    button all funnel through, so clicking "Simulate reply" now sends a
    real email through whatever `EMAIL_PROVIDER` is configured, exactly
    like a genuine reply would. Worth knowing before clicking it against
    live SMTP.
  - `src/lib/leadSender.js` — the send logic (`sendRawEmail`/
    `sendTemplateEmail`) was extracted out of `routes/leads.js` so the
    auto-responder and the HTTP routes call the identical code path
    instead of two copies that could drift.
- **NDA e-signature** (`src/routes/nda.js` + `src/lib/ndaSignToken.js`) —
  the "interested" auto-response email now contains a real, working,
  per-lead signed link (`{{ndaSignUrl}}`, HMAC-signed via
  `NDA_SIGN_SECRET`, same pattern as the unsubscribe link) instead of the
  placeholder "signature link attached" text it used to. The link opens a
  page with the NDA text and a "type your name + agree" form; submitting it
  records `ndaSignedAt`/`ndaSignedName`/`ndaSignedIp` on the `Lead`, flips
  `stage` to `"NDA Signed"`, and logs an `NDA_SIGNED` activity entry.
  **Real limitation, not a nice-to-have caveat**: this is a lightweight
  "clickwrap" signature (typed name + checkbox + IP + timestamp — the same
  mechanism as accepting a Terms of Service checkbox), not a certified
  e-signature the way DocuSign/HelloSign/PandaDoc produce one — no identity
  verification, no signing certificate, no tamper-evident audit trail. Fine
  for recording "someone with the link asserted agreement"; not a
  substitute for a real e-signature vendor if the NDA needs to hold up as a
  certified signature in a dispute. Swapping in a real provider later means
  replacing this route's GET/POST pair with that provider's embedded-signing
  flow — everything else (the signed link, lead lookup, activity logging)
  carries over unchanged. Found and fixed a real XSS hole while building
  this: the lead's name/company and the signer's typed name were being
  interpolated into the HTML response unescaped — added `escapeHtml()` and
  verified directly that a `<script>` payload comes out neutralized.
- **Call booking tracking** (`src/routes/calendlyWebhook.js` +
  `src/lib/calendlyWebhookAuth.js`) — `POST /webhooks/calendly` receives
  Calendly's `invitee.created`/`invitee.canceled` webhook events and
  records `callBookedAt`/`callScheduledFor`/`callCanceledAt` on the `Lead`.
  Signature verification (`Calendly-Webhook-Signature: t=…,v1=…`, HMAC-SHA256
  over `timestamp.rawBody`, written from Calendly's documented scheme but
  **not verified against a live Calendly account** — none available here —
  so double-check the exact header/format against their current docs before
  wiring a real subscription) is fully tested: 8 unit tests, plus sent a
  real self-crafted correctly-signed HTTP request at the running server and
  confirmed it passes signature checking (500 from the missing DB, not 401
  from a rejected signature) while a bad/missing signature correctly gets
  401 before ever touching the database. Calendly never reports whether an
  invitee actually showed up, only that a meeting was booked — so
  `POST /leads/:id/mark-call-completed` is a manual confirmation endpoint,
  not something the webhook can set on its own.
- **CSV bulk lead import** (`POST /leads/bulk` + `../src/lib/csvLeads.js`)
  — an employee pastes CSV rows (`name,company,email,owner`) in the Cold
  Bulk Mailing page; the frontend parses and validates client-side (a
  simple comma-split parser, not full RFC 4180 — fine for this data, not
  for fields containing literal commas), then posts structured JSON to the
  backend. Each row is created independently — one bad row (duplicate, DB
  hiccup) doesn't abort the rest of the batch, same isolation principle as
  the IMAP poller's per-message error handling. Capped at 500 rows per
  request (verified live: a 501-row payload gets rejected with 400 before
  touching the database). Each successfully created lead is auto-enrolled
  in the campaign's cadence exactly like `POST /leads` (single-lead) does.
- **Email open/click tracking** (`src/lib/trackingToken.js`,
  `src/lib/emailTracking.js`, `src/routes/tracking.js`) — the "Open Rate"/
  "Click Rate" numbers shown in the UI used to be either static mock data or
  a fabricated formula (`abTest ? "63%" : "57%"`); they're now real,
  computed from actual recipient behavior. `sendRawEmail`/`sendTemplateEmail`
  (`src/lib/leadSender.js`) create the `ActivityLog` row for a send *before*
  sending it (not after, like every other write in that file), so a 1x1
  tracking pixel and click-redirect links carrying that row's id can be
  embedded in the outgoing HTML — a recipient's mail client loading the
  pixel logs `EMAIL_OPENED`; following a rewritten link logs `LINK_CLICKED`
  and then redirects to the real destination. Both tracking URLs are
  HMAC-signed (`TRACKING_SECRET`, same signed-link pattern as
  unsubscribe/NDA) so an activity log id in the URL can't be
  guessed/enumerated to forge tracking events on someone else's send. The
  unsubscribe link is deliberately excluded from click-rewriting — a
  one-click unsubscribe should go straight to the unsubscribe handler, not
  bounce through another redirect first. `GET /campaigns` now aggregates
  real `sent`/`opened`/`clicked` counts and `openRate`/`clickRate`
  percentages per campaign (counting **distinct leads**, not raw events —
  a recipient re-opening the same email repeatedly doesn't push the rate
  past 100%); the frontend displays these when the backend is reachable and
  falls back to "—" otherwise, same pattern as every other backend-optional
  column. `/track/open/*` and `/track/click/*` are deliberately public (hit
  by mail clients/browsers, which can't carry the internal API key) and
  designed so a database failure never breaks the actual pixel response or
  redirect — the write is best-effort and swallows its own errors; verified
  live by pointing the app at an intentionally-unreachable database and
  confirming both routes still returned a valid 1x1 GIF / 302 redirect
  while the DB error was logged server-side only. Known limitation shared
  by every email platform that does this: many mail clients (Gmail,
  Outlook in some configurations) block remote images by default, so open
  tracking systematically undercounts — there's no better mechanism than
  the pixel; it's just an inherently imperfect signal. 13 unit tests
  covering token signing/verification and the HTML injection/rewriting
  logic, plus the live pixel/redirect/DB-failure verification described
  above.
- **No-reply follow-up cadence** (`src/queue/cadenceQueue.js` +
  `src/lib/cadenceEligibility.js`) — BullMQ + Redis for delayed follow-up
  steps ("Day 0 intro", "Day 3 follow-up", ...). `POST /leads` creates a
  lead under a campaign and auto-enrolls it in that campaign's cadence in
  the same call; `POST /leads/:id/schedule-cadence` re-schedules an
  existing lead. The part that actually matters: each step re-checks
  eligibility **at send time**, not enqueue time — a step queued for "Day 3"
  three days ago only actually sends if the lead is still `NO_REPLY`, not
  bounced, and not unsubscribed by then. Reply, bounce, or unsubscribe in
  between and the step logs `SEND_BLOCKED` and skips instead of sending an
  unwanted reminder to someone who already responded. Optional: the server
  runs fine without `REDIS_URL` set, it just can't schedule delayed sends.
- **Deliverability / bounce-and-spam protection** — this is what code alone
  can actually do; it does **not** guarantee inbox placement, which also
  depends on published SPF/DKIM/DMARC DNS records, domain/IP reputation, and
  recipient engagement history. What's implemented and verified:
  - `src/lib/sendCap.js` — single Prisma-backed daily send cap per campaign,
    enforced on **every** send path (`/send`, `/send-template`, and the
    cadence worker) — previously only the queued path had a cap at all, so
    immediate sends could burst arbitrarily and damage sender reputation.
  - Bounce suppression: `Lead.bounced`/`bounceKind` + `POST
    /webhooks/bounce` (hard bounce or spam complaint → permanently
    suppressed; soft bounce → logged, not suppressed). Every send path
    checks this and refuses (409) if set.
  - `List-Unsubscribe` + `List-Unsubscribe-Post` headers (RFC 8058) on every
    send, plus `POST /unsubscribe/:leadId` for the automatic one-click flow
    Gmail/Yahoo/Outlook use — not just the GET a human clicks. Verified by
    inspecting the raw MIME source of a real sent message.
  - Optional DKIM signing in the SMTP provider (`DKIM_DOMAIN`/`_SELECTOR`/
    `_PRIVATE_KEY`) — verified the `DKIM-Signature` header actually appears
    on a real send with a generated test keypair. Only helps once the
    matching public key is published in DNS, which this repo can't do for
    you.
  - `src/lib/spamCheck.js` — advisory (non-blocking) content heuristics
    (all-caps subject, spam-trigger phrases, missing opt-out mention)
    attached to the activity log on every send.
  - Fixed a real gap this surfaced: the plain-text part of every email had
    no unsubscribe mention at all — only the HTML part did. Some spam
    filters and text-only clients only ever see the plain-text part, so
    `renderTemplate.js` now appends an unsubscribe footer to both.
  - `src/lib/warmup.js` — a new campaign ramps from 50/day up to its
    configured `dailyLimit` over ~3 weeks rather than sending at full
    configured volume from day one; `sendCap.js` always applies whichever is
    smaller of the ramp stage and the configured limit.
  - `src/lib/campaignHealth.js` — after a hard bounce or complaint,
    `routes/bounces.js` recomputes the campaign's bounce/complaint rate and
    auto-pauses it (`status → SCHEDULED`) if it crosses ~5%/0.1% thresholds
    (with a minimum sample size so one early bounce doesn't pause a
    brand-new campaign).
- **Auth**:
  - `src/middleware/apiKey.js` — a shared `API_KEY` (header `x-api-key`)
    gates `/campaigns`, `/leads`, `/templates`. Fails closed: an unset
    `API_KEY` 500s every request rather than silently allowing them through.
    Webhooks and `/unsubscribe` are deliberately exempt — they're hit by
    external systems that can't hold this key, and have their own
    secret/token schemes instead.
  - `src/lib/unsubscribeToken.js` — unsubscribe links now carry an
    HMAC-SHA256 token (`UNSUBSCRIBE_SECRET`) tied to the lead id, so the
    link can't be forged or enumerated the way a bare lead id in a URL
    could be. `/unsubscribe/:leadId/:token`, verified with
    `crypto.timingSafeEqual`.
  - **Known limitation**: `API_KEY` is a single shared secret with no
    per-user scoping, and the frontend holds it in a `VITE_*` env var —
    which ships in the built JS bundle, visible to anyone who opens
    devtools (see the NOTE in `../src/lib/api.js`). Good enough to keep the
    API off the open internet; not real user-level auth.
- **Tests** (`test/`, run with `npm test` — Node's built-in test runner, no
  extra dependency) — 60 tests covering every pure-logic module:
  `renderTemplate`, `spamCheck`, `replyClassifier`, `sendCap`, `warmup`,
  `campaignHealth`, `unsubscribeToken`, `apiKey`, `cadenceEligibility`.
  `sendCap` takes an injectable DB client specifically so it's testable
  without mocking Prisma's proxy-based delegates (which `node:test`'s
  `mock.method` can't introspect reliably — hit that wall, refactored around
  it instead).
- **`docker-compose.yml`** — Postgres 16 + Redis 7 with healthchecks,
  credentials matching `.env.example` exactly so `docker compose up -d`
  then `cp .env.example .env` needs no edits. Not run in this environment
  (no Docker available here) — written and ready, not verified end-to-end.

## What's NOT done yet

- SES/Postmark **API-based** `send()` implementations — currently throw a
  clear error (their SMTP endpoints work today via `EMAIL_PROVIDER=smtp`).
- SPF/DMARC (and DKIM DNS publication) — none of these are things a
  codebase can do on its own; they're DNS records on a real domain you
  control. DKIM **signing** is implemented (see above); the DNS half isn't.
- Realtime push to the frontend (poll `GET /leads/:id/activity` for now).
- `src/App.jsx` still keeps campaigns and the replied-leads list in local
  `useState` — `GET /campaigns` and `GET /leads` both exist server-side now,
  but the frontend doesn't call them. This is why campaign pause/resume
  still isn't wired to the backend: the frontend's campaign ids are
  synthesized locally (`${name}-${index}`) and don't match real DB ids, so
  wiring pause/resume today would just 404 silently. Fixing this requires
  switching the campaigns list to `GET /campaigns` first.
- Per-user auth — see the "Known limitation" note above.
- The daily-cap retry-until-tomorrow logic is a known gap — see the TODO in
  `cadenceQueue.js`.

## Local setup

```bash
cd server
cp .env.example .env
npm install
npx prisma generate

# Postgres + Redis, if you have Docker (untested in this repo's dev
# environment — no Docker was available — but credentials in .env.example
# already match this compose file):
docker compose up -d

npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Without Postgres/Redis provisioned, `npm run dev` still boots and
`GET /health` responds — routes that touch the DB will fail until
`DATABASE_URL` is real and migrated.

## Tests

```bash
npm test
```

Runs everything in `test/` with Node's built-in test runner — no Postgres,
Redis, or network access required; DB-touching logic (`sendCap`) is tested
via an injectable fake client rather than a live database.

### Testing SMTP sending without a real mailbox

`nodemailer` can mint a free, disposable test SMTP account on the fly —
useful for confirming the provider actually sends before pointing it at a
real domain:

```js
import nodemailer from "nodemailer";
const testAccount = await nodemailer.createTestAccount();
console.log(testAccount); // use these as SMTP_HOST/PORT/USER/PASS in .env
```

Every email sent through that account gets a shareable Ethereal preview
link (logged by nodemailer, or via `nodemailer.getTestMessageUrl(info)`) —
nothing is delivered to the real inbox, so it's safe to point `to:` at a
real-looking address during testing.

## Wiring the rest of the frontend to this

Done: `handleSendNextEmail` tries `send-template` first, falls back to raw
`/send`, falls back to the local simulation last. Template drafts load from
the backend on mount (`GET /templates/:key`) and `handleSaveTemplate`
persists edits (`PUT /templates/:key`) — all three tiers verified against a
real running backend in this environment.

Still open: `simulateIncomingReply` in `src/App.jsx` becomes unnecessary
once `POST /webhooks/inbound-email` is wired to a real inbound-parse
provider. Campaign/lead data (`crmData.js`'s mock arrays) should switch to
`GET /campaigns` / `GET /leads` (both exist now) instead of being
hardcoded — see the campaign-id mismatch note in "What's NOT done yet".
