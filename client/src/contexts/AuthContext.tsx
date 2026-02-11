import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getStoredToken, setStoredAuth, clearStoredAuth } from "../lib/auth";
import type { AuthUser } from "../lib/auth";
import { getMe, login as apiLogin } from "../lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    getMe()
      .then(({ user: u }) => setUser(u))
      .catch(() => {
        clearStoredAuth();
        setUser(null);
      })
      .finally(() => setLoading(false));
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
    const { token, user: u } = await apiLogin(username, password);
    setStoredAuth(token, u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const value: AuthContextValue = { user, loading, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
