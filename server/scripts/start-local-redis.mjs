// Local-only dev Redis, no Docker/admin rights required — same reasoning
// as scripts/start-local-db.mjs for Postgres: this machine has no Redis
// installed and Redis has no official Windows build, so redis-memory-server
// (which downloads and runs a real Redis binary, same family as
// mongodb-memory-server) stands in for it. Unlike the Postgres script this
// has no persistent data directory — redis-memory-server doesn't support
// one, and BullMQ's queue state doesn't need to survive a restart for local
// dev anyway. Keeps running in the foreground until killed; the child
// Redis process is tied to this one's lifetime, so this must stay running
// for as long as the queue should be up (run with `npm run redis:start`,
// left running in the background alongside the backend/frontend/Postgres
// dev processes).
import { RedisMemoryServer } from "redis-memory-server";

const PORT = 6379;

const redisServer = new RedisMemoryServer({ instance: { port: PORT, ip: "127.0.0.1" } });
await redisServer.start();
const host = await redisServer.getHost();
const port = await redisServer.getPort();
console.log(`Redis is up on ${host}:${port} — set REDIS_URL="redis://${host}:${port}" in .env.`);

async function shutdown() {
  console.log("Stopping Redis...");
  await redisServer.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Keeps this process (and therefore the Redis child process) alive.
await new Promise(() => {});
