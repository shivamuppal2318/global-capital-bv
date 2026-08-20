import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword } from "../lib/auth.js";
import { requireAdmin } from "../middleware/requireAuth.js";

const router = Router();

// Every route below runs after the global requireAuth gate (see app.js),
// so req.user is already populated — this just adds the extra role check.
router.use(requireAdmin);

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
}

function generatePassword() {
  // Readable-ish random password (base64url, no ambiguous punctuation) for
  // an admin to hand an employee once at account creation.
  return crypto.randomBytes(9).toString("base64url");
}

router.get("/employees", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  res.json(users.map(publicUser));
}));

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
  // Optional — if omitted, a random password is generated and returned
  // once in the response (never retrievable again after this).
  password: z.string().min(8).optional()
});

router.post("/employees", asyncHandler(async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "A user with this email already exists." });
  }

  const temporaryPassword = parsed.data.password ?? generatePassword();
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      passwordHash: await hashPassword(temporaryPassword)
    }
  });

  // temporaryPassword is only ever exposed here, at creation time — there
  // is no "view password" anywhere else in the app.
  res.status(201).json({ ...publicUser(user), temporaryPassword });
}));

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional()
});

router.patch("/employees/:id", asyncHandler(async (req, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (req.params.id === req.user.id && (parsed.data.role === "EMPLOYEE" || parsed.data.status === "SUSPENDED")) {
    return res.status(400).json({ error: "You can't demote or suspend your own account." });
  }

  const user = await prisma.user.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!user) return res.status(404).json({ error: "Employee not found" });
  res.json(publicUser(user));
}));

// Resets an employee's password to a new random one, returned once — for
// when they've lost access and self-service reset (no SMTP-dependent
// "forgot password" email flow exists yet) isn't an option.
router.post("/employees/:id/reset-password", asyncHandler(async (req, res) => {
  const temporaryPassword = generatePassword();
  const user = await prisma.user
    .update({ where: { id: req.params.id }, data: { passwordHash: await hashPassword(temporaryPassword) } })
    .catch(() => null);
  if (!user) return res.status(404).json({ error: "Employee not found" });
  res.json({ ...publicUser(user), temporaryPassword });
}));

router.delete("/employees/:id", asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }
  const user = await prisma.user.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!user) return res.status(404).json({ error: "Employee not found" });
  res.status(204).end();
}));

export default router;
