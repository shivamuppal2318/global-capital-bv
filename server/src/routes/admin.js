import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hashPassword } from "../lib/auth.js";
import { requireAdmin } from "../middleware/requireAuth.js";
import { MODULES, MODULE_IDS, DEFAULT_EMPLOYEE_MODULES, liveModules } from "../lib/permissions.js";
import { encryptSecret } from "../lib/credentialCrypto.js";
import { getSystemEmailSettings, verifySystemEmail, sendSystemEmail, welcomeEmail } from "../lib/systemMailer.js";
import { getAiConfig, getAiSettingsRow, saveAiSettings, clearAiSettings, testAiConnection, DEFAULT_MODEL } from "../lib/aiSettings.js";
import { getProviderKey, getMarketIntelSettingsRow, saveMarketIntelSettings, clearProviderKey } from "../lib/marketIntelligenceSettings.js";
import { testProviderConnection } from "../lib/marketIntelligenceProviderTest.js";
import { appBaseUrl } from "../lib/appUrl.js";

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
    permissions: liveModules(user.permissions),
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
  password: z.string().min(8).optional(),
  permissions: z.array(z.enum(MODULE_IDS)).optional()
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
      permissions: parsed.data.permissions ?? DEFAULT_EMPLOYEE_MODULES,
      passwordHash: await hashPassword(temporaryPassword)
    }
  });

  // Emailing the credentials is best-effort: the account is already
  // created, so a mail failure is reported alongside the password rather
  // than failing the request and leaving an account nobody was told about.
  const mail = welcomeEmail({ name: user.name, email: user.email, temporaryPassword, appUrl: appBaseUrl() });
  const delivery = await sendSystemEmail({ to: user.email, ...mail });

  // temporaryPassword is only ever exposed here, at creation time — there
  // is no "view password" anywhere else in the app.
  res.status(201).json({ ...publicUser(user), temporaryPassword, emailSent: delivery.sent, emailError: delivery.reason ?? null });
}));

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  permissions: z.array(z.enum(MODULE_IDS)).optional()
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

// Resets an employee's password to a new random one, returned once — the
// admin-driven counterpart to the self-service /auth/forgot-password flow,
// for when someone can't receive the reset email.
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

// The grantable module list, served from the backend so the Admin Panel's
// checkboxes and the API's own guards can never disagree about what exists.
router.get("/modules", (_req, res) => res.json(MODULES));

// --- System email (password resets + new account handoffs) --------------

function redactSystemEmail(settings) {
  if (!settings) return null;
  const { smtpPassEncrypted, ...safe } = settings;
  return { ...safe, hasPassword: Boolean(smtpPassEncrypted) };
}

router.get("/system-email", asyncHandler(async (_req, res) => {
  res.json(redactSystemEmail(await getSystemEmailSettings()));
}));

const systemEmailSchema = z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().positive(),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().min(1),
  // Optional on update — omitted means "keep the stored password", so
  // editing the port doesn't require re-entering the credential.
  smtpPass: z.string().min(1).optional(),
  fromAddress: z.string().email(),
  fromName: z.string().min(1).default("Global Capital BV")
});

router.put("/system-email", asyncHandler(async (req, res) => {
  const parsed = systemEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { smtpPass, ...rest } = parsed.data;
  const existing = await getSystemEmailSettings();

  if (!existing) {
    if (!smtpPass) {
      return res.status(400).json({ error: "An SMTP password is required when setting this up the first time." });
    }
    const created = await prisma.systemEmailSettings.create({
      data: { ...rest, smtpPassEncrypted: encryptSecret(smtpPass) }
    });
    return res.json(redactSystemEmail(created));
  }

  const updated = await prisma.systemEmailSettings.update({
    where: { id: existing.id },
    data: { ...rest, ...(smtpPass ? { smtpPassEncrypted: encryptSecret(smtpPass) } : {}) }
  });
  res.json(redactSystemEmail(updated));
}));

// Verifies the saved credentials, and optionally sends a real test message
// so the admin can confirm delivery end to end rather than just auth.
router.post("/system-email/test", asyncHandler(async (req, res) => {
  const settings = await getSystemEmailSettings();
  if (!settings) {
    return res.json({ success: false, message: "Save your SMTP settings first." });
  }

  const verified = await verifySystemEmail(settings);
  if (!verified.success) return res.json(verified);

  const to = String(req.body?.to ?? "").trim();
  if (!to) return res.json(verified);

  const delivery = await sendSystemEmail({
    to,
    subject: "Global Capital BV — test email",
    text: "This is a test message. Your system email settings are working.",
    html: '<p style="font-family:sans-serif">This is a test message. Your system email settings are working.</p>'
  });

  res.json(
    delivery.sent
      ? { success: true, message: `Connected, and a test email was sent to ${to}.` }
      : { success: false, message: `Credentials are valid, but sending failed: ${delivery.reason}` }
  );
}));

// --- Claude API key (AI Assistant + Market Intelligence) ----------------

router.get("/ai-settings", asyncHandler(async (_req, res) => {
  const [row, config] = await Promise.all([getAiSettingsRow(), getAiConfig()]);
  res.json({
    model: row?.model ?? config.model ?? DEFAULT_MODEL,
    // The key itself is never sent back — only enough to show it's set and
    // which of the two sources is currently winning.
    hasKey: Boolean(config.apiKey),
    keyPreview: config.apiKey ? `sk-…${config.apiKey.slice(-4)}` : null,
    source: config.source,
    updatedAt: row?.updatedAt ?? null
  });
}));

const aiSettingsSchema = z.object({
  // Optional on update so the model can be changed without re-pasting the key.
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default(DEFAULT_MODEL)
});

router.put("/ai-settings", asyncHandler(async (req, res) => {
  const parsed = aiSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const existing = await getAiSettingsRow();
  if (!existing && !parsed.data.apiKey) {
    return res.status(400).json({ error: "An API key is required the first time you set this up." });
  }

  await saveAiSettings(parsed.data);
  const config = await getAiConfig();
  res.json({
    model: config.model,
    hasKey: Boolean(config.apiKey),
    keyPreview: config.apiKey ? `sk-…${config.apiKey.slice(-4)}` : null,
    source: config.source
  });
}));

router.post("/ai-settings/test", asyncHandler(async (_req, res) => {
  res.json(await testAiConnection());
}));

// Clears the stored key (rotation, or backing out a wrong one). The AI
// features fall back to ANTHROPIC_API_KEY if that's set, otherwise to
// their "not configured" behaviour — which is honest, rather than leaving
// a key that's shown as configured but rejected on every call.
router.delete("/ai-settings", asyncHandler(async (_req, res) => {
  await clearAiSettings();
  const config = await getAiConfig();
  res.json({ model: config.model, hasKey: Boolean(config.apiKey), keyPreview: null, source: config.source });
}));

// --- Market Intelligence data-source API keys (Exa, NewsAPI.ai, Firecrawl, Apollo) ----

const MARKET_INTEL_PROVIDERS = ["exa", "newsapi", "firecrawl", "apollo"];

function requireKnownProvider(req, res, next) {
  if (!MARKET_INTEL_PROVIDERS.includes(req.params.provider)) {
    return res.status(404).json({ error: `Unknown provider "${req.params.provider}".` });
  }
  next();
}

router.get("/market-intelligence-settings", asyncHandler(async (_req, res) => {
  const row = await getMarketIntelSettingsRow();
  const providers = {};
  for (const provider of MARKET_INTEL_PROVIDERS) {
    const { apiKey, source } = await getProviderKey(provider);
    providers[provider] = {
      hasKey: Boolean(apiKey),
      keyPreview: apiKey ? `…${apiKey.slice(-4)}` : null,
      source
    };
  }
  res.json({ providers, updatedAt: row?.updatedAt ?? null });
}));

const providerKeySchema = z.object({ apiKey: z.string().min(1) });

router.put("/market-intelligence-settings/:provider", requireKnownProvider, asyncHandler(async (req, res) => {
  const parsed = providerKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  await saveMarketIntelSettings({ [req.params.provider]: parsed.data.apiKey });
  const { apiKey, source } = await getProviderKey(req.params.provider);
  res.json({ hasKey: Boolean(apiKey), keyPreview: apiKey ? `…${apiKey.slice(-4)}` : null, source });
}));

router.post("/market-intelligence-settings/:provider/test", requireKnownProvider, asyncHandler(async (req, res) => {
  res.json(await testProviderConnection(req.params.provider));
}));

// Clears the stored key for one provider (rotation, or backing out a wrong
// one). Falls back to that provider's env var if any, otherwise to
// "unconfigured" — the source is simply skipped by the pipeline, same as
// today when no key has ever been set.
router.delete("/market-intelligence-settings/:provider", requireKnownProvider, asyncHandler(async (req, res) => {
  await clearProviderKey(req.params.provider);
  const { apiKey, source } = await getProviderKey(req.params.provider);
  res.json({ hasKey: Boolean(apiKey), keyPreview: apiKey ? `…${apiKey.slice(-4)}` : null, source });
}));

export default router;
