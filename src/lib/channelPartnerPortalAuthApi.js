import { API_ROOT } from "./config";
import { apiFetch, getToken, setToken } from "./apiFetch";

const API_BASE_URL = `${API_ROOT}/api/channel-partner-portal-auth`;

// Deliberately shares apiFetch's gc_auth_token storage with the staff auth
// flow (authApi.js) rather than a separate key. That's what lets the
// *existing* EmailOutreachModule/useEmailOutreachState — and every
// emailCampaignsApi/emailLeadsApi/emailTemplatesApi/emailAccountsApi call
// they make — work completely unchanged for a Channel Partner session: they
// all read the bearer token through this one shared apiFetch. The backend
// tells the two kinds of token apart by their own `type` claim (see
// app.js's dual-auth gate), so this is safe; the one real tradeoff is that
// logging in as staff and as a partner in the very same browser overwrites
// one session with the other, same as any other single-session app.
export const channelPartnerPortalAuthApi = {
  login: async (email, password) => {
    const data = await apiFetch(`${API_BASE_URL}/login`, { method: "POST", body: { email, password } });
    setToken(data.token);
    return data.user;
  },
  me: () => apiFetch(`${API_BASE_URL}/me`),
  // Always resolves with the same generic message whether or not the
  // address exists — the API deliberately doesn't reveal that.
  forgotPassword: (email) => apiFetch(`${API_BASE_URL}/forgot-password`, { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) =>
    apiFetch(`${API_BASE_URL}/reset-password`, { method: "POST", body: { token, newPassword } }),
  acceptLoginToken: async (token) => {
    setToken(token);
    try {
      return await apiFetch(`${API_BASE_URL}/me`);
    } catch (error) {
      setToken(null);
      throw error;
    }
  },
  logout: () => setToken(null),
  hasToken: () => Boolean(getToken())
};
