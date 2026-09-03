import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { verifyPassword, hashPassword, signChannelPartnerUserToken } from "../lib/auth.js";
import { requireChannelPartnerAuth } from "../middleware/requireChannelPartnerAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { loginRateLimit, forgotPasswordRateLimit } from "../middleware/authRateLimit.js";
import { hashResetToken } from "../lib/resetTokenHash.js";
import { sendSystemEmail, passwordResetEmail } from "../lib/systemMailer.js";
import { appBaseUrl } from "../lib/appUrl.js";

export const channelPartnerPortalAuthRouter = Router();

const RESET_TTL_MINUTES = 60;

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

// --- Password reset (public — no session, that's the whole point) --------
// Mirrors routes/auth.js's staff flow exactly, one level down — same
// generic-response/no-enumeration reasoning, same one-time-use/expiry
// token mechanics (see ChannelPartnerPasswordResetToken), just against
// ChannelPartnerUser instead of User. Before this, a partner who forgot
// their password had no self-service option at all — only an admin could
// reset it (see routes/channelPartners.js POST /portal-users/:id/reset-password).

channelPartnerPortalAuthRouter.post(
  "/forgot-password",
  forgotPasswordRateLimit,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();

    const genericOk = () =>
      res.json({ ok: true, message: "If that email has an account, a reset link is on its way." });

    if (!email) return genericOk();

    const channelPartnerUser = await prisma.channelPartnerUser.findUnique({ where: { email } });
    if (!channelPartnerUser || channelPartnerUser.status === "SUSPENDED") return genericOk();

    const rawToken = crypto.randomBytes(32).toString("hex");
    await prisma.channelPartnerPasswordResetToken.create({
      data: {
        channelPartnerUserId: channelPartnerUser.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000)
      }
    });

    const resetUrl = `${appBaseUrl()}/partner?reset=${rawToken}`;
    const mail = passwordResetEmail({ name: channelPartnerUser.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES });
    const result = await sendSystemEmail({ to: channelPartnerUser.email, ...mail });

    if (!result.sent) {
      // Surfaced in the server log only — same reasoning as the staff
      // flow: telling the caller would leak both that the account exists
      // and details of the mail setup.
      console.error(`Channel partner password reset email to ${channelPartnerUser.email} failed: ${result.reason}`);
    }

    genericOk();
  })
);

channelPartnerPortalAuthRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const rawToken = String(req.body?.token ?? "");
    const newPassword = String(req.body?.newPassword ?? "");

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }

    const record = await prisma.channelPartnerPasswordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
      include: { channelPartnerUser: true }
    });

    const invalid = () => res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    if (!record || record.usedAt || record.expiresAt < new Date()) return invalid();

    await prisma.$transaction([
      prisma.channelPartnerUser.update({
        where: { id: record.channelPartnerUserId },
        data: { passwordHash: await hashPassword(newPassword) }
      }),
      prisma.channelPartnerPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Any other outstanding links for this account become useless too —
      // resetting the password should close every pending reset, not just
      // the one that was clicked.
      prisma.channelPartnerPasswordResetToken.deleteMany({ where: { channelPartnerUserId: record.channelPartnerUserId, usedAt: null } })
    ]);

    res.json({ ok: true, message: "Password updated — you can sign in now." });
  })
);
