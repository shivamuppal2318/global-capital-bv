// Shared fetch wrapper used by every src/lib/*Api.js client — attaches the
// logged-in user's JWT to every request and reacts to a 401 in one place
// (clear the stored session, tell the app shell to show the login screen
// again) instead of every api client needing its own auth-expiry handling.
const TOKEN_KEY = "gc_auth_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function onSessionExpired(callback) {
  window.addEventListener("gc:session-expired", callback);
  return () => window.removeEventListener("gc:session-expired", callback);
}

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("gc:session-expired"));
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data;
}
