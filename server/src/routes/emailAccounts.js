import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { encryptSecret, decryptSecret } from "../lib/credentialCrypto.js";

export const emailAccountsRouter = Router();

// smtpPassEncrypted is never included in any response, even encrypted —
// there's no legitimate reason a client needs it back, and every byte of
// ciphertext that leaves the server is one more copy to worry about.
function redact(account) {
  const { smtpPassEncrypted, ...safe } = account;
  return safe;
}

// Employees only see/manage mailboxes they own; Admins see everything
// (owned + shared). A shared mailbox (ownerId null) is only editable by an
// Admin, never by an arbitrary employee.
function canAccess(user, account) {
  return user.role === "ADMIN" || account.ownerId === user.id;
}

emailAccountsRouter.get("/", asyncHandler(async (req, res) => {
  const where = req.user.role === "ADMIN" ? {} : { ownerId: req.user.id };
  const accounts = await prisma.emailAccount.findMany({ where, orderBy: { label: "asc" } });
  res.json(accounts.map(redact));
}));

emailAccountsRouter.get("/:id", asyncHandler(async (req, res) => {
  const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
  }
  if (!canAccess(req.user, account)) {
    return res.status(403).json({ error: "You don't have access to this mailbox." });
  }
  res.json(redact(account));
}));

const createAccountSchema = z.object({
  label: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().positive(),
  smtpSecure: z.boolean().default(true),
  smtpUser: z.string().min(1),
  smtpPass: z.string().min(1),
  fromAddress: z.string().email(),
  dailyLimit: z.number().int().positive().default(500),
  // Admin-only: assign a mailbox to a specific employee, or omit/null it to
  // create a shared company mailbox. Ignored (forced to self) for employees.
  ownerId: z.string().nullable().optional()
});

emailAccountsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { smtpPass, ownerId, ...rest } = parsed.data;
  const resolvedOwnerId = req.user.role === "ADMIN" ? (ownerId ?? null) : req.user.id;

  const account = await prisma.emailAccount.create({
    data: { ...rest, ownerId: resolvedOwnerId, smtpPassEncrypted: encryptSecret(smtpPass) }
  });

  res.status(201).json(redact(account));
}));

const updateAccountSchema = createAccountSchema.partial();

emailAccountsRouter.put("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Email account not found" });
  }
  if (!canAccess(req.user, existing)) {
    return res.status(403).json({ error: "You don't have access to this mailbox." });
  }

  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { smtpPass, ownerId, ...rest } = parsed.data;
  // Only an Admin may reassign ownership (e.g. move a mailbox between
  // employees, or shared <-> personal); an employee editing their own
  // mailbox can't smuggle in a different ownerId.
  const ownerPatch = req.user.role === "ADMIN" && ownerId !== undefined ? { ownerId } : {};
  const data = { ...rest, ...ownerPatch, ...(smtpPass ? { smtpPassEncrypted: encryptSecret(smtpPass) } : {}) };

  const account = await prisma.emailAccount.update({ where: { id: existing.id }, data });
  res.json(redact(account));
}));

emailAccountsRouter.post("/:id/deactivate", asyncHandler(async (req, res) => {
  const existing = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Email account not found" });
  }
  if (!canAccess(req.user, existing)) {
    return res.status(403).json({ error: "You don't have access to this mailbox." });
  }

  const account = await prisma.emailAccount.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json(redact(account));
}));

// Round-trip SMTP check via nodemailer's transporter.verify() — connects
// and authenticates but sends nothing. A fresh, uncached transporter: this
// runs rarely and must never reuse (or poison) the send-path's connection
// cache in lib/emailProvider.js with possibly-wrong credentials.
emailAccountsRouter.post("/:id/test", asyncHandler(async (req, res) => {
  const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
  }
  if (!canAccess(req.user, account)) {
    return res.status(403).json({ error: "You don't have access to this mailbox." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: { user: account.smtpUser, pass: decryptSecret(account.smtpPassEncrypted) }
    });
    await transporter.verify();
    res.json({ success: true, message: "Connected — SMTP credentials are valid." });
  } catch (err) {
    // A failed test (bad credentials, unreachable host) is a normal
    // response, not a server error.
    res.json({ success: false, message: err.message });
  }
}));

emailAccountsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "Email account not found" });
  }
  if (!canAccess(req.user, existing)) {
    return res.status(403).json({ error: "You don't have access to this mailbox." });
  }

  const campaignsUsingAccount = await prisma.emailCampaign.count({ where: { emailAccountId: req.params.id } });
  if (campaignsUsingAccount > 0) {
    return res.status(409).json({
      error: `${campaignsUsingAccount} campaign(s) are still assigned to this account. Reassign them first, or use POST /:id/deactivate instead of deleting.`
    });
  }

  await prisma.emailAccount.delete({ where: { id: existing.id } });
  res.status(204).end();
}));
