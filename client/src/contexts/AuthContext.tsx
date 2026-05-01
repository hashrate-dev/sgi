import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setStoredAuth, clearStoredAuth } from "../lib/auth";
import type { AuthUser } from "../lib/auth";
import { getMe, login as apiLogin, logoutApi, type LoginResponse } from "../lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Tras registro marketplace o login: persiste token y actualiza estado. */
  applyLoginResponse: (r: LoginResponse) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setUser(null);
        clearStoredAuth();
      }
    }, 8000);
    getMe()
      .then(({ user: u }) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredAuth();
          setUser(null);
        }
      })
      .finally(() => {
        clearTimeout(t);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const win = typeof window !== "undefined" ? window : undefined;
    if (!win) return;
    (win as unknown as { __on401?: () => void }).__on401 = () => setUser(null);
    return () => {
      delete (win as unknown as { __on401?: () => void }).__on401;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await apiLogin(username, password);
    setStoredAuth(r.token ?? null, r.user);
    setUser(r.user);
  }, []);

  const applyLoginResponse = useCallback((r: LoginResponse) => {
    setStoredAuth(r.token ?? null, r.user);
    setUser(r.user);
  }, []);

  const logout = useCallback(() => {
    logoutApi().catch(() => {});
    clearStoredAuth();
    setUser(null);
  }, []);

  const value: AuthContextValue = { user, loading, login, applyLoginResponse, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
