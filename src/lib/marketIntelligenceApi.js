import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api/market-intelligence`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
}

export const marketIntelligenceApi = {
  status: () => request("/status"),
  run: ({ query, defaultCampaignId } = {}) => request("/run", { method: "POST", body: { query, defaultCampaignId } }),
  signals: () => request("/signals"),
  // Grounded Q&A over the real captured signals — history is the full
  // prior transcript, oldest first, since nothing is persisted
  // server-side between requests.
  chat: (message, history = []) => request("/chat", { method: "POST", body: { message, history } })
};
