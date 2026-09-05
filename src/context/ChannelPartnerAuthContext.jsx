import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { channelPartnerPortalAuthApi } from "../lib/channelPartnerPortalAuthApi";
import { onSessionExpired } from "../lib/apiFetch";

const ChannelPartnerAuthContext = createContext(null);

// Mirrors AuthContext.jsx exactly, one level down (ChannelPartnerUser
// instead of User) — its own provider/context so a Channel Partner session
// can never leak into the staff AuthContext tree or vice versa.
export function ChannelPartnerAuthProvider({ children }) {
  const [partnerUser, setPartnerUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loginToken = new URLSearchParams(window.location.search).get("loginToken");
    if (loginToken) {
      channelPartnerPortalAuthApi
        .acceptLoginToken(loginToken)
        .then(setPartnerUser)
        .catch(() => channelPartnerPortalAuthApi.logout())
        .finally(() => {
          window.history.replaceState({}, "", window.location.pathname);
          setLoading(false);
        });
      return;
    }
    if (!channelPartnerPortalAuthApi.hasToken()) {
      setLoading(false);
      return;
    }
    channelPartnerPortalAuthApi
      .me()
      .then(setPartnerUser)
      .catch(() => channelPartnerPortalAuthApi.logout())
      .finally(() => setLoading(false));
  }, []);

  // Fired by apiFetch on any 401 (expired/invalid token, or a stray staff
  // token sitting in storage that this portal's /me correctly rejects).
  useEffect(() => onSessionExpired(() => setPartnerUser(null)), []);

  const login = useCallback(async (email, password) => {
    const user = await channelPartnerPortalAuthApi.login(email, password);
    setPartnerUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    channelPartnerPortalAuthApi.logout();
    setPartnerUser(null);
  }, []);

  return (
    <ChannelPartnerAuthContext.Provider value={{ partnerUser, loading, login, logout }}>
      {children}
    </ChannelPartnerAuthContext.Provider>
  );
}

export function useChannelPartnerAuth() {
  const ctx = useContext(ChannelPartnerAuthContext);
  if (!ctx) throw new Error("useChannelPartnerAuth must be used within ChannelPartnerAuthProvider");
  return ctx;
}
