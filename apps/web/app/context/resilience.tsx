"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
const PROD_API_FALLBACK = process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com";

type ResilienceContextValue = {
  isOnline: boolean;
  apiReachable: boolean;
  isDegraded: boolean;
  lastCheckedAt: string | null;
  checkNow: () => Promise<void>;
};

const ResilienceContext = createContext<ResilienceContextValue | null>(null);

function apiBases(): string[] {
  if (process.env.NODE_ENV === "production") {
    return [API_URL, PROD_API_FALLBACK];
  }

  return [API_URL];
}

async function checkBaseHealth(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function ResilienceProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [apiReachable, setApiReachable] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const checkNow = useCallback(async () => {
    if (typeof window !== "undefined" && !window.navigator.onLine) {
      setIsOnline(false);
      setApiReachable(false);
      setLastCheckedAt(new Date().toISOString());
      return;
    }

    setIsOnline(true);

    for (const base of apiBases()) {
      if (await checkBaseHealth(base)) {
        setApiReachable(true);
        setLastCheckedAt(new Date().toISOString());
        return;
      }
    }

    setApiReachable(false);
    setLastCheckedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void checkNow();
    };

    const onOffline = () => {
      setIsOnline(false);
      setApiReachable(false);
      setLastCheckedAt(new Date().toISOString());
    };

    setIsOnline(window.navigator.onLine);
    void checkNow();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const interval = setInterval(() => {
      void checkNow();
    }, 30000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [checkNow]);

  const value = useMemo<ResilienceContextValue>(
    () => ({
      isOnline,
      apiReachable,
      isDegraded: !isOnline || !apiReachable,
      lastCheckedAt,
      checkNow,
    }),
    [isOnline, apiReachable, lastCheckedAt, checkNow],
  );

  return <ResilienceContext.Provider value={value}>{children}</ResilienceContext.Provider>;
}

export function useResilience(): ResilienceContextValue {
  const ctx = useContext(ResilienceContext);
  if (!ctx) {
    throw new Error("useResilience doit etre utilise dans <ResilienceProvider>");
  }
  return ctx;
}
