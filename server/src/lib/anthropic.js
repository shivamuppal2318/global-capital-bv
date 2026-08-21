import Anthropic from "@anthropic-ai/sdk";
import { getAiConfig } from "./aiSettings.js";

// Rebuilt whenever the resolved key changes (see aiSettings.js cache), so
// saving a new key in Admin Panel takes effect without a restart.
let client = null;
let clientKey = null;

// Async because the key now lives in the database (with an env fallback) —
// callers must await this rather than treating it as a sync lookup.
export async function getAnthropicClient() {
  const { apiKey } = await getAiConfig();
  if (!apiKey) return null;

  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientKey = apiKey;
  }
  return client;
}

export async function getAnthropicModel() {
  return (await getAiConfig()).model;
}
