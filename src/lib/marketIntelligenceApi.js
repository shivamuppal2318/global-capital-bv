import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/market-intelligence`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
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
