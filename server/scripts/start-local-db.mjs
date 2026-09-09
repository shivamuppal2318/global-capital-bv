// Local-only dev DB, no Docker/admin rights required. The original
// port-5555 Postgres this project's .env points to didn't survive a
// machine restart and nobody knew how it had been started — this replaces
// it with a self-contained instance embedded-postgres manages entirely
// inside this repo (server/.pgdata, gitignored), matching the same
// host/port/database name so nothing else has to change.
//
// Run once (or whenever .pgdata is deleted) to (re)initialise, then again
// on every fresh dev session to start it: `npm run db:start`.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", ".pgdata");

const pgServer = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "localdev",
  port: 5555,
  persistent: true
});

const action = process.argv[2] ?? "start";

if (action === "start") {
  // .initialise() always runs initdb, which refuses to touch a non-empty
  // directory — fine the very first time (.pgdata doesn't exist yet), but
  // every later `db:start` against the same real data needs this skipped.
  // PG_VERSION only exists once initdb has actually completed.
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pgServer.initialise();
  }
  await pgServer.start();

  // initdb inherits the OS locale for the cluster's default encoding,
  // which on Windows is a non-Unicode codepage (WIN1252) — not enough for
  // real seed data (emoji, non-Latin names, etc.). Created explicitly with
  // UTF8 + the "C" locale instead, which is valid regardless of what the
  // cluster's own default is.
  const client = new pg.Client({ host: "127.0.0.1", port: 5555, user: "postgres", password: "localdev", database: "postgres" });
  await client.connect();
  const { rows } = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'global_capital_dev'`);
  if (rows.length === 0) {
    await client.query(`CREATE DATABASE global_capital_dev ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;`);
    console.log("Created database global_capital_dev (UTF8).");
  } else {
    console.log("Database global_capital_dev already exists — continuing.");
  }
  await client.end();

  console.log("Postgres is up on 127.0.0.1:5555 (user: postgres / password: localdev).");
} else if (action === "stop") {
  await pgServer.stop();
  console.log("Postgres stopped.");
}
