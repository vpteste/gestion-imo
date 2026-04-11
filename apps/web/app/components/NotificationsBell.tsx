"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/auth";

type NotificationItem = {
  id: string;
  type: "rappel_echeance" | "quittance" | "alerte_impaye" | "incident" | "etat_des_lieux" | "systeme";
  subject: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

const TYPE_STYLES: Record<NotificationItem["type"], string> = {
  rappel_echeance: "border-amber-200 bg-amber-50 text-amber-800",
  quittance: "border-emerald-200 bg-emerald-50 text-emerald-800",
  alerte_impaye: "border-red-200 bg-red-50 text-red-800",
  incident: "border-orange-200 bg-orange-50 text-orange-800",
  etat_des_lieux: "border-sky-200 bg-sky-50 text-sky-800",
  systeme: "border-slate-200 bg-slate-50 text-slate-800",
};

const TYPE_LABELS: Record<NotificationItem["type"], string> = {
  rappel_echeance: "Échéance",
  quittance: "Quittance",
  alerte_impaye: "Impayé",
  incident: "Incident",
  etat_des_lieux: "État des lieux",
  systeme: "Système",
};

export default function NotificationsBell() {
  const { user, apiHeaders } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  function timeAgo(value: string): string {
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMin = Math.max(1, Math.floor(diffMs / 60000));
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `il y a ${diffHour} h`;
    const diffDay = Math.floor(diffHour / 24);
    return `il y a ${diffDay} j`;
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: "30",
        unreadOnly: unreadOnly ? "true" : "false",
      });
      const response = await fetch(`${API_URL}/notifications?${query.toString()}`, { headers: apiHeaders });
      if (!response.ok) return;
      setItems((await response.json()) as NotificationItem[]);
    } catch {
      // API temporairement indisponible: on conserve l'état courant sans casser l'UI.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (!user) return;

    const timer = setInterval(() => {
      void load();
    }, 30000);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, apiHeaders, unreadOnly]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onMouseDown(event: MouseEvent) {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      if (!root.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("mousedown", onMouseDown);
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  async function markOneRead(id: string) {
    try {
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "PATCH",
        headers: apiHeaders,
      });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "PATCH",
        headers: apiHeaders,
      });
      setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    } catch {
      // ignore
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        Notifications
        {unreadCount > 0 && (
          <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,28rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" tabIndex={-1}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Centre de notifications</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUnreadOnly((prev) => !prev)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                {unreadOnly ? "Voir tout" : "Non lues"}
              </button>
              <button
                onClick={() => void load()}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Actualiser
              </button>
              <button
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              >
                Tout marquer lu
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Chargement…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune notification</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id} className={`px-4 py-3 ${item.readAt ? "bg-white" : "bg-indigo-50/40"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TYPE_STYLES[item.type]}`}>
                        {TYPE_LABELS[item.type]}
                      </span>
                      {!item.readAt && (
                        <button
                          onClick={() => void markOneRead(item.id)}
                          className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          Marquer lu
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{item.subject}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {timeAgo(item.createdAt)} · {new Date(item.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
