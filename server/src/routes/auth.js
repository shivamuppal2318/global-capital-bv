import { Router } from "express";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
}

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

export default router;
