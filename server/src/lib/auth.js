import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

const TOKEN_TTL = "7d";
const SALT_ROUNDS = 12;
const JWT_SECRET_KEY = "jwt_secret";

let cachedSecret = null;

// Resolved once at boot (see src/index.js). Prefers an operator-supplied
// JWT_SECRET, but falls back to a self-generated key persisted in the
// database so the app works out of the box on a fresh deploy — without a
// signing key ever being committed to the repo or pasted into a dashboard.
// It lives in Postgres, so it survives restarts; rotating it just means
// deleting the row (which invalidates existing sessions).
export async function initJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    cachedSecret = fromEnv;
    return { source: "environment" };
  }

  const existing = await prisma.appSecret.findUnique({ where: { key: JWT_SECRET_KEY } });
  if (existing) {
    cachedSecret = existing.value;
    return { source: "database" };
  }

  const generated = crypto.randomBytes(32).toString("hex");
  // Concurrent boots (e.g. a rolling restart) can race here; whoever loses
  // the create re-reads the winner's value so both agree on one secret.
  try {
    const created = await prisma.appSecret.create({ data: { key: JWT_SECRET_KEY, value: generated } });
    cachedSecret = created.value;
    return { source: "generated" };
  } catch {
    const raced = await prisma.appSecret.findUnique({ where: { key: JWT_SECRET_KEY } });
    if (!raced) throw new Error("Could not create or read the JWT signing secret.");
    cachedSecret = raced.value;
    return { source: "database" };
  }
}

function jwtSecret() {
  if (!cachedSecret) {
    throw new Error("JWT secret not initialised — initJwtSecret() must run before signing/verifying.");
  }
  return cachedSecret;
}

export function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, jwtSecret(), { expiresIn: TOKEN_TTL });
}

// Throws (jsonwebtoken's JsonWebTokenError / TokenExpiredError) on an
// invalid or expired token — callers should catch and respond 401.
export function verifyToken(token) {
  return jwt.verify(token, jwtSecret());
}

// Client-portal sessions (see routes/clientPortal.js) — same signing key
// as staff tokens, but a `type: "client"` claim staff tokens never carry
// and requireClientAuth explicitly checks for. A client token's `sub` is a
// ClientUser id, which doesn't exist in the User table at all, so even
// without that check a client token could never resolve to a staff
// account — this is defense in depth, not the only thing stopping it.
const CLIENT_TOKEN_TTL = "30d";

export function signClientToken(clientUser) {
  return jwt.sign({ sub: clientUser.id, email: clientUser.email, type: "client" }, jwtSecret(), {
    expiresIn: CLIENT_TOKEN_TTL
  });
}

export function verifyClientToken(token) {
  const payload = jwt.verify(token, jwtSecret());
  if (payload.type !== "client") throw new Error("Not a client-portal token.");
  return payload;
}

// Channel Partner portal sessions (see routes/channelPartnerAgreement.js
// and middleware/requireChannelPartnerAuth.js) — same signing key again,
// `type: "channel-partner"` this time. Bearer-header, not a cookie: unlike
// the client portal (server-rendered HTML), the partner portal is a real
// SPA reusing EmailOutreachModule, so it follows the staff app's
// Authorization-header convention instead.
const CHANNEL_PARTNER_TOKEN_TTL = "30d";

export function signChannelPartnerUserToken(channelPartnerUser, expiresIn = CHANNEL_PARTNER_TOKEN_TTL) {
  return jwt.sign(
    { sub: channelPartnerUser.id, email: channelPartnerUser.email, type: "channel-partner" },
    jwtSecret(),
    { expiresIn }
  );
}

export function verifyChannelPartnerUserToken(token) {
  const payload = jwt.verify(token, jwtSecret());
  if (payload.type !== "channel-partner") throw new Error("Not a channel-partner-portal token.");
  return payload;
}
