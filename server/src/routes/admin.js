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
import { AI_DATA_SOURCES, AI_DATA_SOURCE_IDS } from "../lib/aiDataSources.js";
import { getProviderKey, getMarketIntelSettingsRow, saveMarketIntelSettings, clearProviderKey } from "../lib/marketIntelligenceSettings.js";
import { testProviderConnection } from "../lib/marketIntelligenceProviderTest.js";
import { appBaseUrl } from "../lib/appUrl.js";
import { recordAudit } from "../lib/auditLog.js";

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
  await recordAudit({ req, action: "employee.created", entityType: "User", entityId: user.id, detail: `Created ${user.email} (${user.role})` });

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
  await recordAudit({
    req,
    action: "employee.updated",
    entityType: "User",
    entityId: user.id,
    detail: `Updated ${user.email}: ${Object.entries(parsed.data).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join(", ")}`
  });
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
  await recordAudit({ req, action: "employee.password_reset", entityType: "User", entityId: user.id, detail: `Admin reset password for ${user.email}` });
  res.json({ ...publicUser(user), temporaryPassword });
}));

router.delete("/employees/:id", asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }
  const user = await prisma.user.delete({ where: { id: req.params.id } }).catch(() => null);
  if (!user) return res.status(404).json({ error: "Employee not found" });
  // Not FK'd to the deleted user (actorId/entityId both go stale on
  // purpose) — the snapshot fields (actorName/actorEmail, detail) are what
  // keep this row meaningful after the account is gone.
  await recordAudit({ req, action: "employee.deleted", entityType: "User", entityId: user.id, detail: `Deleted ${user.email}` });
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
    await recordAudit({ req, action: "system_email.configured", entityType: "SystemEmailSettings", entityId: created.id, detail: `${created.smtpHost} · ${created.fromAddress}` });
    return res.json(redactSystemEmail(created));
  }

  const updated = await prisma.systemEmailSettings.update({
    where: { id: existing.id },
    data: { ...rest, ...(smtpPass ? { smtpPassEncrypted: encryptSecret(smtpPass) } : {}) }
  });
  await recordAudit({ req, action: "system_email.updated", entityType: "SystemEmailSettings", entityId: updated.id, detail: `${updated.smtpHost} · ${updated.fromAddress}` });
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
  const [row, config, pinnedCount] = await Promise.all([
    getAiSettingsRow(),
    getAiConfig(),
    prisma.document.count({ where: { pinnedToAi: true } })
  ]);
  res.json({
    model: row?.model ?? config.model ?? DEFAULT_MODEL,
    // The key itself is never sent back — only enough to show it's set and
    // which of the two sources is currently winning.
    hasKey: Boolean(config.apiKey),
    keyPreview: config.apiKey ? `sk-…${config.apiKey.slice(-4)}` : null,
    source: config.source,
    // null means never configured, which the assistant treats as "all on".
    dataSources: row ? row.dataSources : null,
    availableDataSources: AI_DATA_SOURCES,
    companyProfile: row?.companyProfile ?? "",
    pinnedDocumentCount: pinnedCount,
    updatedAt: row?.updatedAt ?? null
  });
}));

const aiSettingsSchema = z.object({
  // Optional on update so the model can be changed without re-pasting the key.
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).default(DEFAULT_MODEL),
  dataSources: z.array(z.enum(AI_DATA_SOURCE_IDS)).optional(),
  companyProfile: z.string().max(20000).optional()
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

  const saved = await saveAiSettings(parsed.data);
  const config = await getAiConfig();
  await recordAudit({
    req,
    action: "ai_settings.updated",
    detail: `Model ${saved.model}${parsed.data.apiKey ? ", API key changed" : ""}${parsed.data.dataSources ? `, data sources: ${parsed.data.dataSources.join(",")}` : ""}`
  });
  res.json({
    model: config.model,
    hasKey: Boolean(config.apiKey),
    keyPreview: config.apiKey ? `sk-…${config.apiKey.slice(-4)}` : null,
    source: config.source,
    dataSources: saved.dataSources,
    availableDataSources: AI_DATA_SOURCES,
    companyProfile: saved.companyProfile ?? ""
  });
}));

// --- AI knowledge base (documents pinned into every answer) -------------

// Reuses the Data Room's Document table rather than a parallel store: same
// upload, same text extraction, same file on disk. "Knowledge base" is
// simply the pinned subset, so a document already in the Data Room can be
// promoted without re-uploading it.
router.get("/ai-knowledge", asyncHandler(async (_req, res) => {
  const docs = await prisma.document.findMany({
    orderBy: [{ pinnedToAi: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      originalName: true,
      category: true,
      description: true,
      sizeBytes: true,
      mimeType: true,
      pinnedToAi: true,
      extractedText: true,
      extractionNote: true,
      createdAt: true
    }
  });
  res.json(
    docs.map(({ extractedText, ...d }) => ({
      ...d,
      searchable: Boolean(extractedText),
      // Enough to confirm the right thing was read, without shipping the
      // whole document back to the browser.
      textPreview: extractedText ? extractedText.slice(0, 180) : null
    }))
  );
}));

router.post("/ai-knowledge/:id/pin", asyncHandler(async (req, res) => {
  const pinned = req.body?.pinned !== false;
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  if (pinned && !doc.extractedText) {
    return res.status(400).json({
      error: "That file has no readable text, so pinning it would add nothing. Scanned PDFs and images can't be quoted from."
    });
  }

  const updated = await prisma.document.update({ where: { id: doc.id }, data: { pinnedToAi: pinned } });
  res.json({ id: updated.id, pinnedToAi: updated.pinnedToAi });
}));

router.post("/ai-settings/test", asyncHandler(async (_req, res) => {
  res.json(await testAiConnection());
}));

// Clears the stored key (rotation, or backing out a wrong one). The AI
// features fall back to ANTHROPIC_API_KEY if that's set, otherwise to
// their "not configured" behaviour — which is honest, rather than leaving
// a key that's shown as configured but rejected on every call.
router.delete("/ai-settings", asyncHandler(async (req, res) => {
  await clearAiSettings();
  const config = await getAiConfig();
  await recordAudit({ req, action: "ai_settings.key_cleared" });
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
  await recordAudit({ req, action: "market_intel_settings.key_saved", detail: `Provider: ${req.params.provider}` });
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
  await recordAudit({ req, action: "market_intel_settings.key_cleared", detail: `Provider: ${req.params.provider}` });
  res.json({ hasKey: Boolean(apiKey), keyPreview: apiKey ? `…${apiKey.slice(-4)}` : null, source });
}));

// --- Audit log ------------------------------------------------------------

const MAX_AUDIT_PAGE_SIZE = 100;

// Simple offset pagination plus optional action-prefix filter (e.g.
// "employee." matches every employee.* action) — enough for a company this
// size; a growing table would want keyset pagination instead, but that's
// not a real problem yet.
router.get("/audit-logs", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_AUDIT_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 25));
  const actionPrefix = req.query.action ? String(req.query.action) : null;

  const where = actionPrefix ? { action: { startsWith: actionPrefix } } : {};

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ]);

  res.json({ rows, total, page, pageSize });
}));

// Distinct action names actually in use, for the filter dropdown — avoids
// hardcoding a list in the frontend that drifts from what's really written.
router.get("/audit-logs/actions", asyncHandler(async (_req, res) => {
  const rows = await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  res.json(rows.map((r) => r.action));
}));

export default router;
