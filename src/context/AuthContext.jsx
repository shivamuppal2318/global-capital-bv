import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "../lib/authApi";
import { onSessionExpired } from "../lib/apiFetch";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authApi.hasToken()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => authApi.logout())
      .finally(() => setLoading(false));
  }, []);

  // Fired by apiFetch on any 401 (expired/invalid token) from anywhere in
  // the app — drops back to the login screen without every api client
  // needing its own auth-expiry handling.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (email, password) => {
    const loggedInUser = await authApi.login(email, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
