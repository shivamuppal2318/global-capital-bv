import { API_ROOT } from "./config";
import { apiFetch } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/whatsapp`;

function request(path, options = {}) {
  return apiFetch(`${API_BASE_URL}${path}`, options);
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body })
};
