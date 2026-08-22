import { prisma } from "./prisma.js";
import { encryptSecret, decryptSecret } from "./credentialCrypto.js";

// Resolves each Market Intelligence data-source key the same way
// aiSettings.js resolves the Claude key. Checked in this order per
// provider:
//   1. Admin Panel → Market Intelligence (stored encrypted in the database)
//   2. The provider's *_API_KEY environment variable
//
// The database comes first deliberately: env vars set through Coolify's UI
// don't reliably reach the container (the same problem aiSettings.js was
// built to work around), so storing the key in the app is the path that
// actually works in production. The env fallback keeps local dev working
// unchanged.

const PROVIDERS = {
  exa: { field: "exaApiKeyEncrypted", envVar: "EXA_API_KEY" },
  newsapi: { field: "newsApiKeyEncrypted", envVar: "NEWSAPI_AI_KEY" },
  firecrawl: { field: "firecrawlApiKeyEncrypted", envVar: "FIRECRAWL_API_KEY" },
  apollo: { field: "apolloApiKeyEncrypted", envVar: "APOLLO_API_KEY" }
};

// One row read per process rather than per lookup — writes invalidate it,
// so a key change takes effect immediately instead of needing a restart.
let cachedRow;

export function invalidateMarketIntelSettingsCache() {
  cachedRow = undefined;
}

async function getRow() {
  if (cachedRow === undefined) {
    cachedRow = await prisma.marketIntelSettings.findFirst();
  }
  return cachedRow;
}

// Returns { apiKey, source } for one provider — apiKey is null if neither
// the database nor the environment has a key for it.
export async function getProviderKey(provider) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Unknown Market Intelligence provider: ${provider}`);

  const row = await getRow();
  const encrypted = row?.[config.field];
  if (encrypted) {
    return { apiKey: decryptSecret(encrypted), source: "admin-panel" };
  }

  const fromEnv = process.env[config.envVar];
  if (fromEnv) {
    return { apiKey: fromEnv, source: "environment" };
  }

  return { apiKey: null, source: "unset" };
}

export async function isProviderConfigured(provider) {
  return Boolean((await getProviderKey(provider)).apiKey);
}

export async function getMarketIntelSettingsRow() {
  return prisma.marketIntelSettings.findFirst();
}

// `keys` is a partial map like { exa: "...", apollo: "" } — an empty string
// clears that provider's stored key (reverting to its env var if any),
// omitting a provider entirely leaves it untouched.
export async function saveMarketIntelSettings(keys) {
  const existing = await prisma.marketIntelSettings.findFirst();
  const data = {};
  for (const [provider, value] of Object.entries(keys)) {
    const config = PROVIDERS[provider];
    if (!config) continue;
    data[config.field] = value ? encryptSecret(value) : null;
  }

  const saved = existing
    ? await prisma.marketIntelSettings.update({ where: { id: existing.id }, data })
    : await prisma.marketIntelSettings.create({ data });

  invalidateMarketIntelSettingsCache();
  return saved;
}

export async function clearProviderKey(provider) {
  return saveMarketIntelSettings({ [provider]: "" });
}
