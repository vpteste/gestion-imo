"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UserRole } from "@gestion/shared";

const STORAGE_KEY = "gestion_token";
const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  /** En-têtes à injecter dans chaque fetch vers l'API */
  apiHeaders: Record<string, string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restauration depuis localStorage au montage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        const parsed = JSON.parse(stored) as { token: string; user: AuthUser };
        setToken(parsed.token);
        setUser(parsed.user);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(body.message ?? `Erreur (${response.status})`);
    }

    const data = (await response.json()) as {
      accessToken: string;
      user: AuthUser;
    };

    setToken(data.accessToken);
    setUser(data.user);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: data.accessToken, user: data.user }),
    );

    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // En-têtes à utiliser dans toutes les requêtes API
  const apiHeaders = useMemo<Record<string, string>>(() => {
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {} as Record<string, string>;
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, isLoading, login, logout, apiHeaders }),
    [user, token, isLoading, login, logout, apiHeaders],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth doit être utilisé dans un <AuthProvider>");
  }

  return ctx;
}
