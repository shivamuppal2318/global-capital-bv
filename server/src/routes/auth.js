import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendSystemEmail, passwordResetEmail } from "../lib/systemMailer.js";
import { liveModules } from "../lib/permissions.js";
import { appBaseUrl } from "../lib/appUrl.js";

const router = Router();

const RESET_TTL_MINUTES = 60;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions: liveModules(user.permissions)
  };
}

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

router.post("/login", asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Same generic message whether the email doesn't exist or the password is
  // wrong — distinguishing the two lets an attacker enumerate valid emails.
  const invalid = () => res.status(401).json({ error: "Invalid email or password." });

  if (!user) return invalid();
  if (user.status === "SUSPENDED") {
    return res.status(403).json({ error: "This account has been suspended. Contact an admin." });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || user.status === "SUSPENDED") {
    return res.status(401).json({ error: "Session no longer valid." });
  }
  res.json(publicUser(user));
}));

router.patch("/me/password", requireAuth, asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
}));

// --- Password reset (public — no session, that's the whole point) --------

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();

  // Always the same answer whether or not the address exists, so this
  // can't be used to discover who has an account here.
  const genericOk = () =>
    res.json({ ok: true, message: "If that email has an account, a reset link is on its way." });

  if (!email) return genericOk();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status === "SUSPENDED") return genericOk();

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000)
    }
  });

  const resetUrl = `${appBaseUrl()}/?reset=${rawToken}`;
  const mail = passwordResetEmail({ name: user.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES });
  const result = await sendSystemEmail({ to: user.email, ...mail });

  if (!result.sent) {
    // Surfaced in the server log only — telling the caller would leak both
    // that the account exists and details of our mail setup.
    console.error(`Password reset email to ${user.email} failed: ${result.reason}`);
  }

  genericOk();
}));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const rawToken = String(req.body?.token ?? "");
  const newPassword = String(req.body?.newPassword ?? "");

  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true }
  });

  const invalid = () => res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  if (!record || record.usedAt || record.expiresAt < new Date()) return invalid();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) }
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Any other outstanding links for this account become useless too —
    // resetting the password should close every pending reset, not just
    // the one that was clicked.
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } })
  ]);

  res.json({ ok: true, message: "Password updated — you can sign in now." });
}));

export default router;
