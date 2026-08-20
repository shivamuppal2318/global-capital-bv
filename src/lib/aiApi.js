import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/ai`;

export async function sendChatMessage(message, history) {
  const data = await apiFetch(`${API_BASE_URL}/chat`, { method: "POST", body: { message, history } });
  return data.reply;
}
