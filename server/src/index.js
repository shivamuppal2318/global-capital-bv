import "dotenv/config";
import app from "./app.js";
import { initJwtSecret } from "./lib/auth.js";
import { initEncryptionKey } from "./lib/credentialCrypto.js";
import { startCadenceWorker } from "./queue/cadenceQueue.js";
import { startImapPoller } from "./lib/imapPoller.js";
import { startMarketIntelligenceScheduler } from "./lib/marketIntelligence/scheduler.js";

const port = process.env.PORT ?? 4000;

// The signing key must exist before any request can be authenticated, so
// resolve it (env var, or the self-generated one stored in the database)
// before accepting traffic.
const { source } = await initJwtSecret();
console.log(`JWT signing secret loaded from ${source}.`);

// Must resolve before any request can store or read an SMTP password or
// API key — encryptSecret/decryptSecret are synchronous and rely on it.
const { source: encryptionSource } = await initEncryptionKey();
console.log(`Credential encryption key loaded from ${encryptionSource}.`);

app.listen(port, () => {
  console.log(`WhatsApp Business API server listening on http://localhost:${port}`);
});

// Each of these no-ops cleanly when its own prerequisite is missing
// (REDIS_URL, IMAP_HOST, or any market-intelligence source respectively) —
// safe to always call rather than gating them on env checks here too.
startCadenceWorker();
startImapPoller();
startMarketIntelligenceScheduler();
