# Deployment reference — Global Capital BV

How this app actually gets from a local change to the live server. Written so
any tool/agent (Claude, Codex, a human) can follow the same process without
re-deriving it.

## Server

- Host: `82.112.238.182`, SSH port `22`, user `root`.
- App lives at `/opt/global-capital-bv` on the server (same layout as this
  repo: `src/` frontend, `server/` backend).
- Frontend is a Vite build served as static files by **nginx** on port
  `8096` (public).
- Backend is a Node/Express process managed by **pm2**, process name
  `global-capital-bv-backend`, listening on port `8095` (internal only —
  nginx proxies `/api/...` to it).
- Database: PostgreSQL, accessed through Prisma. Schema lives at
  `server/prisma/schema.prisma`; migrations at `server/prisma/migrations/`.

## Credentials

The SSH password is **never** hardcoded in scripts or committed files. It's
passed as the `DEPLOY_PW2` environment variable at the moment a deploy script
runs, e.g.:

```
DEPLOY_PW2='<password>' node redeploy-something.mjs
```

Get the password from whoever owns the server — don't invent, guess, or
store it in the repo.

## Git workflow (do this first, every time)

The `deploy` branch is the one actually running on the server. Other
sessions/people can push to it too, so **always check for divergence before
pushing your own work**:

```bash
git fetch origin
git log HEAD..origin/deploy --oneline   # anything listed = you're behind
```

If behind, fast-forward (safe if there's no overlap with your own uncommitted
changes — check `git diff --stat HEAD..origin/deploy` for file overlap first
if you have uncommitted local changes):

```bash
git pull --ff-only origin deploy
```

Then, after making your change:

```bash
npm test --prefix server        # backend test suite
npm run build                   # frontend build (repo root)
git add <changed files>          # never `git add -A` — name files explicitly
git commit -m "..."               # end with: Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
git push origin deploy
```

## Packaging what changed

Only the files that actually changed get sent — not the whole repo. Tar them
up preserving repo-relative paths so extracting over `/opt/global-capital-bv`
lands them in the right place:

```bash
tar -czf /tmp/my-change.tar.gz \
  server/src/routes/whatever.js \
  src/components/whatever/Whatever.jsx
```

If `server/prisma/schema.prisma` changed, the matching migration folder
under `server/prisma/migrations/<timestamp>_<name>/migration.sql` must be
included too.

## The deploy script

A small Node script using the `ssh2` package does the actual transfer + 
remote commands. This exact shape is reused for every deploy — copy it,
change the tarball name and the steps that apply:

```js
import { Client } from "ssh2";

const conn = new Client();

function run(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- ${label} ---`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on("data", (d) => process.stdout.write(d.toString()));
      stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
      stream.on("close", (code) => { console.log(`\n[exit ${code}]`); resolve(code); });
    });
  });
}

conn
  .on("ready", async () => {
    console.log("=== CONNECTED ===");
    conn.sftp(async (err, sftp) => {
      if (err) throw err;
      const localPath = "C:\\path\\to\\my-change.tar.gz";
      sftp.fastPut(localPath, "/root/my-change.tar.gz", async (err) => {
        if (err) throw err;
        console.log("Uploaded tarball");
        await run(conn, "tar -xzf /root/my-change.tar.gz -C /opt/global-capital-bv && rm /root/my-change.tar.gz", "extract over existing deployment");

        // Only if schema.prisma changed:
        await run(conn, "cd /opt/global-capital-bv/server && npx prisma migrate deploy 2>&1", "apply database migration");
        await run(conn, "cd /opt/global-capital-bv/server && npx prisma generate 2>&1 | tail -10", "regenerate prisma client");

        // Only if anything under src/ (frontend) changed:
        await run(conn, "cd /opt/global-capital-bv && npm run build 2>&1 | tail -20", "frontend build");

        // Always, if any server/ file changed:
        await run(conn, "pm2 restart global-capital-bv-backend 2>&1 | tail -10", "restart backend");

        await run(conn, "sleep 2 && curl -s http://127.0.0.1:8095/api/health && echo && curl -s -o /dev/null -w 'nginx:%{http_code}\\n' http://127.0.0.1:8096/", "health check");
        conn.end();
      });
    });
  })
  .on("error", (err) => console.error("SSH ERROR:", err.message))
  .connect({ host: "82.112.238.182", port: 22, username: "root", password: process.env.DEPLOY_PW2, readyTimeout: 15000 });
```

Run it with the password supplied on the command line (never saved to disk):

```bash
DEPLOY_PW2='<password>' node redeploy-something.mjs
```

### What to include per deploy, depending on what changed

| Changed | Steps to run |
|---|---|
| Only `src/` (frontend) | extract → `npm run build` (repo root on the server) → `pm2 restart` → health check |
| Only `server/` (backend, no schema change) | extract → `pm2 restart` → health check |
| `server/prisma/schema.prisma` + a new migration | extract → `prisma migrate deploy` → `prisma generate` → `pm2 restart` (+ `npm run build` too if frontend also changed) → health check |

A clean exit code `0` from `prisma migrate deploy` and a `{"status":"ok"}` /
`nginx:200` from the health check step both mean the deploy landed.

## Verifying it actually works (don't just trust a green deploy)

After every deploy, actually exercise the change against the live site —
this project's own discipline is to verify with real data, not just "it
built and restarted cleanly":

- For a UI change: a Playwright script that logs in
  (`admin@yourcompany.com` / real password — ask the project owner, don't
  guess) and drives the real flow, with a screenshot.
- For a backend-only change: a short one-off Node script uploaded the same
  way (SFTP + `conn.exec`) and run directly on the server with
  `node script.mjs`, importing the real `prisma` client
  (`./src/lib/prisma.js`) to read/write real rows and print the result.
- Clean up anything a verification script creates (a test lead, a
  diagnostic activity-log row, etc.) once confirmed — don't leave synthetic
  data sitting in production tables. Deleting a row that other rows
  reference via a foreign key (e.g. `EmailActivityLog.leadId`) needs the
  dependent rows deleted first.

## Common mistakes to avoid

- Don't skip the `git fetch`/divergence check — another session can push to
  `deploy` while you're mid-task, and blindly pushing on top can silently
  create a fork or overwrite work.
- Don't tar up the whole repo — package exactly the changed files, named
  explicitly.
- Don't forget `prisma generate` after `prisma migrate deploy` — the running
  Node process needs the regenerated client to know about new
  columns/enum values.
- Don't assume a build succeeding means the feature works — verify against
  the real running site.
