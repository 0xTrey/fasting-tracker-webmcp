import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionState } from "@shared/types";
import { queryClient } from "@/lib/queryClient";

interface AuthContextValue {
  session: SessionState | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markExpired: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Unable to reach the tracker";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setSession(await response.json() as SessionState);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh().catch(() => {
      setSession({ authenticated: false, mode: "production" });
      setIsLoading(false);
    });
  }, []);

  const login = async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const next = await response.json() as SessionState;
    queryClient.clear();
    setSession(next);
  };

  const markExpired = () => {
    queryClient.clear();
    setSession((current) => ({ authenticated: false, mode: current?.mode ?? "production" }));
  };

  const logout = async () => {
    if (!session?.csrfToken) {
      markExpired();
      return;
    }
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
      },
      body: "{}",
    });
    if (!response.ok && response.status !== 401) throw new Error(await readApiError(response));
    markExpired();
  };

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    login,
    logout,
    markExpired,
    refresh,
  }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
