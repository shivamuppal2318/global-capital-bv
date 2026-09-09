import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Applied to every login endpoint across all three identity tiers (staff,
// client, channel partner) — none of them had any limit on password
// attempts before this, so a single IP could brute-force any account's
// password with unlimited tries. Keyed by IP + the submitted email so
// attempts against one specific account are capped regardless of how many
// different accounts get guessed from the same IP. req.ip must go through
// ipKeyGenerator — express-rate-limit v8 throws ERR_ERL_KEY_GEN_IPV6 on a
// raw IPv6 address in a custom key otherwise (a bare address string lets
// an IPv6 client dodge the limit across equivalent representations of the
// same address; the helper normalizes to a fixed subnet first).
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? "").trim().toLowerCase()}`,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many login attempts. Wait 15 minutes and try again." });
  }
});

// Looser and IP-only (not per-email) — forgot-password intentionally
// returns the same generic response whether or not the address exists, so
// there's no separate "wrong password" signal to key on the way login has.
export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests. Wait an hour and try again." });
  }
});
