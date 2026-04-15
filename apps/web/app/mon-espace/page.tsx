"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/auth";

type Payment = {
  id: string;
  leaseId: string;
  leaseReference?: string;
  propertyReference?: string;
  propertyTitle?: string;
  tenantName: string;
  dueDate: string;
  amountDue: number;
  amountPaid?: number;
  status: "paye" | "retard" | "impaye";
  lateDays: number;
};

type Alerts = {
  lateCount: number;
  unpaidCount: number;
  totalAlerts: number;
};

type Contract = {
  id: string;
  fileName: string;
  leaseId?: string;
  leaseReference?: string;
  propertyReference?: string;
  propertyTitle?: string;
  uploadedAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3001");

export default function MonEspacePage() {
  const { apiHeaders, user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [tenantMessage, setTenantMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function downloadContract(contract: Contract) {
    try {
      const response = await fetch(`${API_URL}/contracts/${contract.id}/download`, {
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error("Téléchargement impossible");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = contract.fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [paymentsRes, alertsRes, tenantRes] = await Promise.all([
          fetch(`${API_URL}/payments`, { headers: apiHeaders }),
          fetch(`${API_URL}/payments/alerts`, { headers: apiHeaders }),
          fetch(`${API_URL}/locataire`, { headers: apiHeaders }),
        ]);

        const contractsRes = await fetch(`${API_URL}/contracts`, { headers: apiHeaders });

        if (!paymentsRes.ok || !alertsRes.ok || !tenantRes.ok || !contractsRes.ok) {
          throw new Error("Chargement impossible pour l'espace locataire");
        }

        setPayments((await paymentsRes.json()) as Payment[]);
        setAlerts((await alertsRes.json()) as Alerts);
        setContracts((await contractsRes.json()) as Contract[]);
        const tenantData = (await tenantRes.json()) as { message?: string };
        setTenantMessage(tenantData.message ?? "Zone locataire accessible");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    }

    void load();
  }, [apiHeaders]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Espace locataire</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Bonjour {user?.fullName ?? "Locataire"}</h1>
          <p className="mt-2 text-sm text-slate-600">{tenantMessage}</p>
        </header>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Mes échéances</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{payments.length}</p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Retards</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{alerts?.lateCount ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Impayés</p>
            <p className="mt-2 text-2xl font-semibold text-red-700">{alerts?.unpaidCount ?? 0}</p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mes paiements</h2>
          <p className="mt-1 text-sm text-slate-500">Vue personnelle filtrée sur votre compte uniquement.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-4">Bail</th>
                  <th className="py-2 pr-4">Bien</th>
                  <th className="py-2 pr-4">Échéance</th>
                  <th className="py-2 pr-4">Montant</th>
                  <th className="py-2 pr-4">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="py-2 pr-4 text-slate-700">{payment.leaseReference ?? payment.leaseId}</td>
                    <td className="py-2 pr-4 text-slate-700">{payment.propertyReference ?? "-"}</td>
                    <td className="py-2 pr-4 text-slate-700">{new Date(payment.dueDate).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-4 text-slate-700">{payment.amountDue.toLocaleString("fr-FR")} FCFA</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${payment.status === "paye" ? "bg-emerald-100 text-emerald-700" : payment.status === "retard" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">Aucun paiement associé à votre compte.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mes contrats</h2>
          <p className="mt-1 text-sm text-slate-500">Documents rattachés à vos baux uniquement.</p>
          <div className="mt-4 space-y-3">
            {contracts.map((contract) => (
              <div key={contract.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">{contract.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {(contract.leaseReference ?? contract.leaseId ?? "Sans bail")} · {(contract.propertyReference ?? "Bien non renseigné")} · {new Date(contract.uploadedAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadContract(contract)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Télécharger
                </button>
              </div>
            ))}
            {contracts.length === 0 && <p className="text-sm text-slate-400">Aucun contrat disponible pour votre compte.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
