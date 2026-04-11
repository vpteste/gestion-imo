"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Link from "next/link";
import { useAuth } from "../context/auth";

type Summary = {
  totals: {
    properties: number;
    contracts: number;
    payments: number;
    alerts: number;
  };
  financial: {
    totalRent: number;
    collectionRate: number;
  };
  geography?: Record<string, number>;
  paymentStatus?: Record<string, number>;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

const STATUS_COLORS: Record<string, string> = {
  paye:   "#22c55e",
  retard: "#f59e0b",
  impaye: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  paye:   "Payé",
  retard: "En retard",
  impaye: "Impayé",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { apiHeaders } = useAuth();

  async function downloadPdfBilan() {
    try {
      let response = await fetch(`${API_URL}/dashboard/summary/pdf`, {
        headers: apiHeaders,
      });

      if (response.status === 404) {
        response = await fetch(`${API_URL}/dashboard/summary-pdf`, {
          headers: apiHeaders,
        });
      }

      if (!response.ok) {
        throw new Error(`Téléchargement impossible (${response.status})`);
      }

      const blob = await response.blob();
      const fileName = `bilan-${new Date().toISOString().slice(0, 10)}.pdf`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`${API_URL}/dashboard/summary`, {
          headers: apiHeaders,
        });

        if (!response.ok) {
          throw new Error(`Erreur dashboard (${response.status})`);
        }

        const data = (await response.json()) as Summary;
        setSummary({
          ...data,
          geography: data.geography ?? {},
          paymentStatus: data.paymentStatus ?? {},
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    }

    void load();
  }, [apiHeaders]);

  // Données pour les graphiques
  const kpiData = summary
    ? [
        { label: "Biens",     value: summary.totals.properties, color: "#6366f1" },
        { label: "Contrats",  value: summary.totals.contracts,  color: "#0ea5e9" },
        { label: "Paiements", value: summary.totals.payments,   color: "#22c55e" },
        { label: "Alertes",   value: summary.totals.alerts,     color: "#ef4444" },
      ]
    : [];

  const geoData = summary
    ? Object.entries(summary.geography ?? {}).map(([city, count]) => ({ name: city, value: count }))
    : [];

  const statusData = summary
    ? Object.entries(summary.paymentStatus ?? {}).map(([status, count]) => ({
        name:  STATUS_LABELS[status] ?? status,
        value: count,
        color: STATUS_COLORS[status] ?? "#94a3b8",
      }))
    : [];

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-8">

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">
                Synthèse locative — activité, finances et répartition géographique.
              </p>
            </div>
            <button
              onClick={() => void downloadPdfBilan()}
              className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100"
            >
              Télécharger bilan PDF
            </button>
          </div>
        </header>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
        )}
        {!summary && !error && (
          <p className="py-12 text-center text-sm text-slate-500">Chargement…</p>
        )}

        {summary && (
          <>
            {/* KPI cards */}
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {kpiData.map((kpi) => (
                <article
                  key={kpi.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  style={{ borderTop: `4px solid ${kpi.color}` }}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
                  <p className="mt-2 text-3xl font-bold" style={{ color: kpi.color }}>
                    {kpi.value}
                  </p>
                </article>
              ))}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-800">Assistant d&apos;actions</h2>
              <p className="mt-1 text-sm text-slate-500">Suggestions intelligentes basées sur votre activité en cours.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Link
                  href="/paiements"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Priorité</p>
                  <p className="mt-1 text-sm font-semibold text-amber-900">
                    {summary.totals.alerts > 0
                      ? `Traiter ${summary.totals.alerts} alerte(s) de paiement`
                      : "Aucune alerte critique"}
                  </p>
                </Link>

                <Link
                  href="/etats-des-lieux"
                  className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 hover:bg-sky-100"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Terrain</p>
                  <p className="mt-1 text-sm font-semibold text-sky-900">
                    Vérifier les signatures et photos des états des lieux
                  </p>
                </Link>

                <Link
                  href="/contrats"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 hover:bg-emerald-100"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Conformité</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-900">
                    {summary.totals.contracts === 0
                      ? "Importer vos premiers contrats"
                      : "Maintenir les contrats à jour"}
                  </p>
                </Link>
              </div>
            </section>

            {/* Activité globale — BarChart */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">Activité globale</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={kpiData} barCategoryGap="35%">
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [Number(value ?? 0), "Nombre"]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {kpiData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Financier + Statuts paiements */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-800">Financier</h2>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Loyers cumulés</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">
                      {summary.financial.totalRent.toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                      Taux d&apos;encaissement :{" "}
                      <span className="font-semibold text-green-600">
                        {summary.financial.collectionRate}%
                      </span>
                    </p>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${summary.financial.collectionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-base font-semibold text-slate-800">Statuts des paiements</h2>
                {statusData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">Aucun paiement</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [Number(value ?? 0), String(name ?? "")] } />
                      <Legend iconType="circle" iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </article>
            </section>

            {/* Répartition géographique — BarChart horizontal */}
            {geoData.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-800">
                  Répartition géographique — biens par ville
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={geoData} layout="vertical" barCategoryGap="30%">
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [Number(value ?? 0), "Biens"]} />
                    <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
