import { API_ROOT } from "./config";
import { apiFetch, getToken, setToken } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/auth`;

export const authApi = {
  login: async (email, password) => {
    const data = await apiFetch(`${API_BASE_URL}/login`, { method: "POST", body: { email, password } });
    setToken(data.token);
    return data.user;
  },
  me: () => apiFetch(`${API_BASE_URL}/me`),
  changePassword: (currentPassword, newPassword) =>
    apiFetch(`${API_BASE_URL}/me/password`, { method: "PATCH", body: { currentPassword, newPassword } }),
  logout: () => setToken(null),
  hasToken: () => Boolean(getToken())
};
