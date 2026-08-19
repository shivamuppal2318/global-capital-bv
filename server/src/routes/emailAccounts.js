import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { encryptSecret } from "../lib/credentialCrypto.js";

export const emailAccountsRouter = Router();

// smtpPassEncrypted is never included in any response, even encrypted —
// there's no legitimate reason a client needs it back, and every byte of
// ciphertext that leaves the server is one more copy to worry about.
function redact(account) {
  const { smtpPassEncrypted, ...safe } = account;
  return safe;
}

emailAccountsRouter.get("/", asyncHandler(async (_req, res) => {
  const accounts = await prisma.emailAccount.findMany({ orderBy: { label: "asc" } });
  res.json(accounts.map(redact));
}));

emailAccountsRouter.get("/:id", asyncHandler(async (req, res) => {
  const account = await prisma.emailAccount.findUnique({ where: { id: req.params.id } });
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
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
  dailyLimit: z.number().int().positive().default(500)
});

emailAccountsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { smtpPass, ...rest } = parsed.data;
  const account = await prisma.emailAccount.create({
    data: { ...rest, smtpPassEncrypted: encryptSecret(smtpPass) }
  });

  res.status(201).json(redact(account));
}));

const updateAccountSchema = createAccountSchema.partial();

emailAccountsRouter.put("/:id", asyncHandler(async (req, res) => {
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { smtpPass, ...rest } = parsed.data;
  const data = smtpPass ? { ...rest, smtpPassEncrypted: encryptSecret(smtpPass) } : rest;

  const account = await prisma.emailAccount
    .update({ where: { id: req.params.id }, data })
    .catch(() => null);
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
  }

  res.json(redact(account));
}));

emailAccountsRouter.post("/:id/deactivate", asyncHandler(async (req, res) => {
  const account = await prisma.emailAccount
    .update({ where: { id: req.params.id }, data: { isActive: false } })
    .catch(() => null);
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
  }
  res.json(redact(account));
}));

emailAccountsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const campaignsUsingAccount = await prisma.emailCampaign.count({ where: { emailAccountId: req.params.id } });
  if (campaignsUsingAccount > 0) {
    return res.status(409).json({
      error: `${campaignsUsingAccount} campaign(s) are still assigned to this account. Reassign them first, or use POST /:id/deactivate instead of deleting.`
    });
  }

  const account = await prisma.emailAccount.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!account) {
    return res.status(404).json({ error: "Email account not found" });
  }
  res.status(204).end();
}));
