"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./context/auth";
import { NAV_LINKS, ROLE_LABELS } from "./lib/rbac";

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
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  const { user, apiHeaders } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableModules = useMemo(
    () => (user ? NAV_LINKS.filter((item) => item.href !== "/" && item.roles.includes(user.role)) : []),
    [user],
  );

  useEffect(() => {
    async function loadSummary() {
      if (!user) {
        setSummary(null);
        return;
      }

      try {
        setError(null);
        const response = await fetch(`${API_URL}/dashboard/summary`, { headers: apiHeaders });
        if (!response.ok) {
          throw new Error(`Erreur dashboard (${response.status})`);
        }

        const data = (await response.json()) as Summary;
        setSummary(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    }

    void loadSummary();
  }, [apiHeaders, user]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <header className="rounded-2xl border border-brand-100 bg-white/90 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Accueil opérationnel</p>
          <h1 className="mt-2 text-2xl font-bold text-brand-900 sm:text-3xl">Centre de pilotage immobilier</h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            {user
              ? `Connecté en tant que ${ROLE_LABELS[user.role]}. Vue consolidée des activités et priorités du jour.`
              : "Connexion requise pour accéder aux modules métier."}
          </p>

          {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            {availableModules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="inline-flex rounded-xl border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-50"
              >
                Ouvrir {module.label}
              </Link>
            ))}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Biens actifs</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{summary?.totals.properties ?? 0}</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Taux d'encaissement</p>
            <p className="mt-2 text-2xl font-semibold text-green-700">{summary?.financial.collectionRate ?? 0}%</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Alertes paiements</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{summary?.totals.alerts ?? 0}</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Loyers cumulés</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">
              {(summary?.financial.totalRent ?? 0).toLocaleString("fr-FR")} FCFA
            </p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-amber-900">Priorité immédiate</h2>
            <p className="mt-2 text-sm text-amber-800">
              {summary && summary.totals.alerts > 0
                ? `${summary.totals.alerts} alerte(s) de paiement à traiter aujourd'hui.`
                : "Aucune alerte critique en cours."}
            </p>
            <Link href="/paiements" className="mt-3 inline-flex text-sm font-semibold text-amber-900 underline underline-offset-2">
              Ouvrir le suivi des paiements
            </Link>
          </article>

          <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-sky-900">Contrôle terrain</h2>
            <p className="mt-2 text-sm text-sky-800">Vérifier les états des lieux, photos et signatures locataires.</p>
            <Link href="/etats-des-lieux" className="mt-3 inline-flex text-sm font-semibold text-sky-900 underline underline-offset-2">
              Ouvrir les états des lieux
            </Link>
          </article>

          <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-900">Conformité documentaire</h2>
            <p className="mt-2 text-sm text-emerald-800">Suivre les contrats actifs et les pièces administratives manquantes.</p>
            <Link href="/contrats" className="mt-3 inline-flex text-sm font-semibold text-emerald-900 underline underline-offset-2">
              Ouvrir les contrats
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
