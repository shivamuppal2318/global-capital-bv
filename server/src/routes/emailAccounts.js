import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { encryptSecret, decryptSecret } from "../lib/credentialCrypto.js";
import { recordAudit } from "../lib/auditLog.js";
import { getImapStatus, fetchNow } from "../lib/imapPoller.js";

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

// Backs the Mailbox tab's real "Fetch Diagnostics" info and its "Fetch Now"
// button's result — registered before /:id so Express doesn't treat these
// literal paths as an account id.
emailAccountsRouter.get("/imap-status", (_req, res) => {
  res.json(getImapStatus());
});

emailAccountsRouter.post("/fetch-now", asyncHandler(async (_req, res) => {
  try {
    const result = await fetchNow();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status ?? 500).json({ success: false, error: err.message });
  }
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
  // Trimmed — a stray leading/trailing space from copy-pasting credentials
  // silently breaks real SMTP auth (an invalid host/username, not a clear
  // error) rather than getting caught here. Confirmed live: this is exactly
  // how two "lyi" mailboxes ended up existing for the same account — the
  // first save had a leading space in smtpUser/smtpHost, so a second,
  // correctly-typed one was created instead of the first ever being fixed.
  label: z.string().trim().min(1),
  smtpHost: z.string().trim().min(1),
  smtpPort: z.number().int().positive(),
  smtpSecure: z.boolean().default(true),
  smtpUser: z.string().trim().min(1),
  smtpPass: z.string().min(1),
  fromAddress: z.string().trim().email(),
  dailyLimit: z.number().int().positive().default(500),
  // Country/region this mailbox represents (e.g. "IN", "AE", "NL") — matched
  // case-insensitively against EmailLead.country to auto-route a lead's send
  // through it (see src/lib/accountRouting.js). Omit/null for a mailbox with
  // no country routing (only used via direct campaign assignment).
  country: z.string().trim().min(1).nullable().optional(),
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
  await recordAudit({ req, action: "mailbox.created", entityType: "EmailAccount", entityId: account.id, detail: `${account.label} (${account.smtpHost})` });

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
  await recordAudit({ req, action: "mailbox.deactivated", entityType: "EmailAccount", entityId: account.id, detail: account.label });
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
  await recordAudit({ req, action: "mailbox.deleted", entityType: "EmailAccount", entityId: existing.id, detail: existing.label });
  res.status(204).end();
}));
