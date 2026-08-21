import { prisma } from "../db.js";
import { encryptSecret, decryptSecret } from "./credentialCrypto.js";

// Resolves the Claude credentials the AI Assistant and Market Intelligence
// both run on. Checked in this order:
//   1. Admin Panel → AI Assistant (stored encrypted in the database)
//   2. ANTHROPIC_API_KEY / ANTHROPIC_MODEL environment variables
//
// The database comes first deliberately: env vars set through Coolify's UI
// don't reliably reach the container (the same substitution problem that
// broke CORS_ORIGIN and JWT_SECRET), so storing the key in the app is the
// path that actually works. The env fallback keeps local dev and any
// non-Coolify deployment working unchanged.

export const DEFAULT_MODEL = "claude-sonnet-5";

// One decrypt per process rather than per request. Writes clear it, so a
// key change takes effect immediately instead of needing a restart.
let cached = null;

export function invalidateAiConfigCache() {
  cached = null;
}

export async function getAiConfig() {
  if (cached) return cached;

  const row = await prisma.aiSettings.findFirst();
  if (row?.apiKeyEncrypted) {
    cached = {
      apiKey: decryptSecret(row.apiKeyEncrypted),
      model: row.model || DEFAULT_MODEL,
      source: "admin-panel"
    };
    return cached;
  }

  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv) {
    cached = { apiKey: fromEnv, model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, source: "environment" };
    return cached;
  }

  cached = { apiKey: null, model: row?.model || DEFAULT_MODEL, source: "unset" };
  return cached;
}

export async function isAiConfigured() {
  return Boolean((await getAiConfig()).apiKey);
}

export async function getAiSettingsRow() {
  return prisma.aiSettings.findFirst();
}

export async function saveAiSettings({ apiKey, model }) {
  const existing = await prisma.aiSettings.findFirst();
  const data = {
    model: model || DEFAULT_MODEL,
    ...(apiKey ? { apiKeyEncrypted: encryptSecret(apiKey) } : {})
  };

  const saved = existing
    ? await prisma.aiSettings.update({ where: { id: existing.id }, data })
    : await prisma.aiSettings.create({ data: { ...data, apiKeyEncrypted: encryptSecret(apiKey) } });

  invalidateAiConfigCache();
  return saved;
}

// Cheapest possible real call that proves the key works — asks the model
// for a single token rather than trusting that a well-formed key is valid.
export async function testAiConnection() {
  const { apiKey, model, source } = await getAiConfig();
  if (!apiKey) {
    return { success: false, message: "No Claude API key is set. Paste one above and save first." };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: "user", content: "Reply with OK." }] })
    });

    if (response.ok) {
      const where = source === "environment" ? " (using the ANTHROPIC_API_KEY env var)" : "";
      return { success: true, message: `Connected to ${model}${where}.` };
    }

    const body = await response.json().catch(() => null);
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    // 401/403 is a bad key; 404 usually means the model name is wrong.
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: `Anthropic rejected the key: ${detail}` };
    }
    if (response.status === 404) {
      return { success: false, message: `Model "${model}" was not found. Check the model id: ${detail}` };
    }
    return { success: false, message: detail };
  } catch (err) {
    return { success: false, message: `Could not reach the Anthropic API: ${err.message}` };
  }
}
