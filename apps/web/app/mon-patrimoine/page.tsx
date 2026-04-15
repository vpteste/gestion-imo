"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/auth";

type Property = {
  id: string;
  reference: string;
  title: string;
  city: string;
  rentAmount: number;
  chargesAmount: number;
};

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  currentPropertyId?: string;
  currentPropertyReference?: string;
  status: "actif" | "inactif" | "en_attente";
};

type PaymentSummary = {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3001");

export default function MonPatrimoinePage() {
  const { apiHeaders, user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [propertiesRes, tenantsRes, summaryRes] = await Promise.all([
          fetch(`${API_URL}/properties`, { headers: apiHeaders }),
          fetch(`${API_URL}/tenants`, { headers: apiHeaders }),
          fetch(`${API_URL}/dashboard/summary`, { headers: apiHeaders }),
        ]);

        if (!propertiesRes.ok || !tenantsRes.ok || !summaryRes.ok) {
          throw new Error("Chargement impossible pour l'espace propriétaire");
        }

        setProperties((await propertiesRes.json()) as Property[]);
        setTenants((await tenantsRes.json()) as Tenant[]);
        setSummary((await summaryRes.json()) as PaymentSummary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    }

    void load();
  }, [apiHeaders]);

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status === "actif").length,
    [tenants],
  );

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Espace propriétaire</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Bonjour {user?.fullName ?? "Propriétaire"}</h1>
          <p className="mt-2 text-sm text-slate-600">Vue personnalisée sur votre patrimoine, vos locataires et vos indicateurs.</p>
        </header>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mes biens</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{summary?.totals.properties ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Locataires actifs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{activeTenants}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Alertes</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{summary?.totals.alerts ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Taux d'encaissement</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{summary?.financial.collectionRate ?? 0}%</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Mes biens</h2>
            <div className="mt-4 space-y-3">
              {properties.map((property) => (
                <div key={property.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{property.title}</p>
                      <p className="text-sm text-slate-500">{property.reference} · {property.city}</p>
                    </div>
                    <div className="text-right text-sm text-slate-700">
                      <p>{property.rentAmount.toLocaleString("fr-FR")} FCFA</p>
                      <p className="text-slate-500">Charges {property.chargesAmount.toLocaleString("fr-FR")} FCFA</p>
                    </div>
                  </div>
                </div>
              ))}
              {properties.length === 0 && <p className="text-sm text-slate-400">Aucun bien associé.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Mes locataires</h2>
            <div className="mt-4 space-y-3">
              {tenants.map((tenant) => (
                <div key={tenant.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{tenant.firstName} {tenant.lastName}</p>
                      <p className="text-sm text-slate-500">Bien: {tenant.currentPropertyReference ?? tenant.currentPropertyId ?? "non affecté"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tenant.status === "actif" ? "bg-emerald-100 text-emerald-700" : tenant.status === "en_attente" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                      {tenant.status}
                    </span>
                  </div>
                </div>
              ))}
              {tenants.length === 0 && <p className="text-sm text-slate-400">Aucun locataire visible.</p>}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
