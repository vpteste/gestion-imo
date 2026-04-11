"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/auth";

type ActivityLogEntry = {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  actorId?: string;
  actorRole?: string;
  actorEmail?: string;
  userAgent?: string;
  durationMs?: number;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

function toBusinessLabel(path: string): string {
  if (path.includes("/auth/login")) return "Connexion";
  if (path.includes("/locataires")) return "Gestion locataire";
  if (path.includes("/paiements")) return "Gestion paiement";
  if (path.includes("/contrats")) return "Gestion contrat";
  if (path.includes("/biens")) return "Gestion bien immobilier";
  if (path.includes("/incidents")) return "Gestion incident";
  if (path.includes("/etats-des-lieux")) return "Etat des lieux";
  if (path.includes("/users")) return "Gestion acces utilisateur";
  return "Action applicative";
}

function toSeverity(statusCode: number): "Succes" | "Attention" | "Erreur" {
  if (statusCode >= 500) return "Erreur";
  if (statusCode >= 400) return "Attention";
  return "Succes";
}

export default function ActivityLogsPage() {
  const { apiHeaders } = useAuth();
  const [items, setItems] = useState<ActivityLogEntry[]>([]);
  const [method, setMethod] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [pathContains, setPathContains] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (method) params.set("method", method);
    if (role) params.set("role", role);
    if (pathContains) params.set("pathContains", pathContains);
    params.set("limit", "200");
    return params.toString();
  }, [method, role, pathContains]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/activity-logs?${query}`, { headers: apiHeaders });
        if (!response.ok) {
          throw new Error(`Erreur API (${response.status})`);
        }
        const data = (await response.json()) as ActivityLogEntry[];
        setItems(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [apiHeaders, query]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Journaux d&apos;activité</h1>
          <p className="mt-1 text-sm text-slate-500">Lecture simplifiee des actions pour equipes non techniques.</p>
        </header>

        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Toutes méthodes</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Tous rôles</option>
            <option value="admin">admin</option>
            <option value="agent">agent</option>
            <option value="proprietaire">proprietaire</option>
            <option value="locataire">locataire</option>
          </select>

          <input
            value={pathContains}
            onChange={(e) => setPathContains(e.target.value)}
            placeholder="Contient /payments"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <button
            onClick={() => {
              setMethod("");
              setRole("");
              setPathContains("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Réinitialiser
          </button>
        </section>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Evenement</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Responsable</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Niveau</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">Chargement...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">Aucun evenement</td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const severity = toSeverity(item.statusCode);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{new Date(item.timestamp).toLocaleString("fr-FR")}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <p className="font-semibold">{toBusinessLabel(item.path)}</p>
                          <p className="text-xs text-slate-500">{item.method}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {(item.actorEmail || item.actorId || "anonyme") + (item.actorRole ? ` (${item.actorRole})` : "")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold ${
                              severity === "Erreur"
                                ? "bg-red-50 text-red-700"
                                : severity === "Attention"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-green-50 text-green-700"
                            }`}
                          >
                            {severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p>Code {item.statusCode}</p>
                          <p className="text-xs text-slate-500">{item.path} | {item.durationMs ?? 0} ms</p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
