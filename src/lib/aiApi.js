import { API_ROOT } from "./config";

const API_BASE_URL = `${API_ROOT}/api/ai`;

export async function sendChatMessage(message, history) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data.reply;
}
