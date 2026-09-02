import { Router } from "express";
import { prisma } from "../db.js";
import { verifyPassword, signChannelPartnerUserToken } from "../lib/auth.js";
import { requireChannelPartnerAuth } from "../middleware/requireChannelPartnerAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { loginRateLimit } from "../middleware/authRateLimit.js";

export const channelPartnerPortalAuthRouter = Router();

function publicChannelPartnerUser(channelPartnerUser) {
  return {
    id: channelPartnerUser.id,
    name: channelPartnerUser.name,
    email: channelPartnerUser.email,
    status: channelPartnerUser.status,
    permissions: channelPartnerUser.permissions,
    channelPartner: { id: channelPartnerUser.channelPartner.id, name: channelPartnerUser.channelPartner.name }
  };
}

// Mirrors routes/auth.js's staff /login exactly (same generic-error-message
// reasoning: don't let a failed login distinguish "no such email" from
// "wrong password"). There's no equivalent to ClientUser's cookie-based
// portal here — this issues a bearer token, since the partner portal is a
// real SPA (see ChannelPartnerPortalApp.jsx) following the staff app's
// Authorization-header convention.
channelPartnerPortalAuthRouter.post("/login", loginRateLimit, asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const channelPartnerUser = await prisma.channelPartnerUser.findUnique({
    where: { email },
    include: { channelPartner: { select: { id: true, name: true } } }
  });
  const invalid = () => res.status(401).json({ error: "Invalid email or password." });

  if (!channelPartnerUser) return invalid();
  if (channelPartnerUser.status === "SUSPENDED") {
    return res.status(403).json({ error: "This account has been suspended. Contact Global Capital BV." });
  }

  const ok = await verifyPassword(password, channelPartnerUser.passwordHash);
  if (!ok) return invalid();

  await prisma.channelPartnerUser.update({ where: { id: channelPartnerUser.id }, data: { lastLoginAt: new Date() } });

  res.json({ token: signChannelPartnerUserToken(channelPartnerUser), user: publicChannelPartnerUser(channelPartnerUser) });
}));

channelPartnerPortalAuthRouter.get(
  "/me",
  requireChannelPartnerAuth,
  asyncHandler(async (req, res) => {
    const channelPartnerUser = await prisma.channelPartnerUser.findUnique({
      where: { id: req.channelPartner.userId },
      include: { channelPartner: { select: { id: true, name: true } } }
    });
    if (!channelPartnerUser) return res.status(401).json({ error: "Session no longer valid." });
    res.json(publicChannelPartnerUser(channelPartnerUser));
  })
);
