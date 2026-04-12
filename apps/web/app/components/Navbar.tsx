"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/auth";
import NotificationsBell from "./NotificationsBell";
import { NAV_LINKS, ROLE_LABELS } from "../lib/rbac";

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "MOON SERVICES";
const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
const PROD_API_FALLBACK = process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com";

type OnlineAgent = {
  agentId: string;
  agentEmail?: string;
  lastSeenAt: string;
  ipAddress?: string;
  deviceSummary?: string;
};

function apiBases(): string[] {
  if (process.env.NODE_ENV === "production") {
    return [API_URL, PROD_API_FALLBACK];
  }

  return [API_URL];
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (const base of apiBases()) {
    try {
      return await fetch(`${base}${path}`, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("API inaccessible");
}

export default function Navbar() {
  const { user, logout, isLoading, apiHeaders } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([]);
  const [showOnlinePanel, setShowOnlinePanel] = useState(false);
  const visibleLinks = user
    ? NAV_LINKS.filter((item) => item.roles.includes(user.role))
    : [];
  const isAdmin = user?.role === "admin";

  const onlineAgentsCount = useMemo(() => onlineAgents.length, [onlineAgents]);

  useEffect(() => {
    for (const link of visibleLinks) {
      router.prefetch(link.href);
    }
  }, [router, visibleLinks]);

  useEffect(() => {
    if (!isAdmin) {
      setOnlineAgents([]);
      return;
    }

    let active = true;

    async function loadOnlineAgents() {
      try {
        const res = await fetchApi("/auth/online-agents", { headers: apiHeaders });
        if (!res.ok) {
          return;
        }

        if (!active) {
          return;
        }

        setOnlineAgents((await res.json()) as OnlineAgent[]);
      } catch {
        // ignore
      }
    }

    void loadOnlineAgents();
    const timer = setInterval(() => {
      void loadOnlineAgents();
    }, 30_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [isAdmin, apiHeaders]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
        <Link
          href="/dashboard"
          className="mr-2 inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-2.5 py-1.5"
        >
          <img src="/LOGO IMO.jpg" alt="Logo" className="h-6 w-6 rounded-md border border-teal-200 bg-white p-0.5" />
          <span className="text-sm font-semibold text-teal-900">{BRAND_NAME}</span>
        </Link>

        {visibleLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-lg border px-3 py-1 text-sm font-semibold transition-colors ${
              pathname === href
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 text-slate-800 hover:bg-slate-100"
            }`}
          >
            {label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {isLoading ? null : user ? (
            <>
              <NotificationsBell />
              {isAdmin && (
                <div className="relative">
                  <button
                    onClick={() => setShowOnlinePanel((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    title="Agents connectés (activité récente 5 min)"
                  >
                    <span>🟢</span>
                    <span>{onlineAgentsCount}</span>
                  </button>

                  {showOnlinePanel && (
                    <div className="absolute right-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
                      <p className="text-xs font-semibold text-slate-700">Agents connectés (temps réel léger)</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Basé sur l'activité des 5 dernières minutes.</p>

                      <div className="mt-2 max-h-72 overflow-y-auto">
                        {onlineAgents.length === 0 ? (
                          <p className="py-3 text-xs text-slate-400">Aucun agent actif en ce moment</p>
                        ) : (
                          <ul className="space-y-2">
                            {onlineAgents.map((agent) => (
                              <li key={agent.agentId} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                                <p className="text-xs font-semibold text-slate-700">{agent.agentEmail ?? agent.agentId}</p>
                                <p className="text-[11px] text-slate-500">{agent.deviceSummary ?? "Appareil non identifié"}</p>
                                <p className="text-[11px] text-slate-500">IP: {agent.ipAddress ?? "N/A"}</p>
                                <p className="text-[11px] text-slate-400">Vu à {new Date(agent.lastSeenAt).toLocaleTimeString("fr-FR")}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <span className="hidden text-xs text-slate-500 sm:block">
                {user.fullName}{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 hover:bg-red-100"
              >
                Déconnexion
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Connexion
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
