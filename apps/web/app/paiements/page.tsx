"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  currentPropertyId?: string;
  currentPropertyReference?: string;
  leaseId?: string;
  leaseReference?: string;
};

type Property = {
  id: string;
  reference: string;
  title: string;
  addressLine: string;
  city: string;
  rentAmount: number;
};

type PaymentTarget = {
  id: string;
  fullName: string;
  email: string;
  propertyId?: string;
  propertyReference?: string;
  leaseId?: string;
  leaseReference?: string;
  rentAmount?: number;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function PaiementsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [targets, setTargets] = useState<PaymentTarget[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [propertyMetaByKey, setPropertyMetaByKey] = useState<Record<string, { reference: string; label: string; rentAmount: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    targetId: "",
    dueDate: new Date().toISOString().slice(0, 10),
    amountDue: "",
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    id: "",
    dueDate: "",
    amountDue: "",
    amountPaid: "",
    lateDays: "0",
    status: "retard" as "paye" | "retard" | "impaye",
    notes: "",
  });
  const { apiHeaders, user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "agent";

  async function loadData() {
    setError(null);

    try {
      const [paymentsRes, alertsRes] = await Promise.all([
        fetch(`${API_URL}/payments`, { headers: apiHeaders }),
        fetch(`${API_URL}/payments/alerts`, { headers: apiHeaders }),
      ]);

      if (!paymentsRes.ok || !alertsRes.ok) {
        throw new Error("Echec chargement paiements");
      }

      setPayments((await paymentsRes.json()) as Payment[]);
      setAlerts((await alertsRes.json()) as Alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function loadTargets(): Promise<PaymentTarget[]> {
    try {
      const [tenantsRes, propertiesRes] = await Promise.all([
        fetch(`${API_URL}/tenants`, { headers: apiHeaders }),
        fetch(`${API_URL}/properties`, { headers: apiHeaders }),
      ]);

      if (!tenantsRes.ok || !propertiesRes.ok) {
        return [];
      }

      const tenants = (await tenantsRes.json()) as Tenant[];
      const properties = (await propertiesRes.json()) as Property[];
      const propertyMeta = new Map<string, { reference: string; label: string; rentAmount: number }>();

      for (const property of properties) {
        const meta = {
          reference: property.reference,
          label: `${property.title} - ${property.addressLine}, ${property.city}`,
          rentAmount: property.rentAmount,
        };
        propertyMeta.set(property.id, meta);
        propertyMeta.set(property.reference, meta);
      }

      setPropertyMetaByKey(Object.fromEntries(propertyMeta.entries()));

      const mapped = tenants.map((tenant): PaymentTarget => ({
        id: tenant.id,
        fullName: `${tenant.firstName} ${tenant.lastName}`.trim(),
        email: tenant.email,
        propertyId: tenant.currentPropertyId,
        propertyReference: tenant.currentPropertyReference ?? (tenant.currentPropertyId ? propertyMeta.get(tenant.currentPropertyId)?.reference : undefined),
        leaseId: tenant.leaseId,
        leaseReference: tenant.leaseReference ?? tenant.leaseId,
        rentAmount: tenant.currentPropertyId ? propertyMeta.get(tenant.currentPropertyId)?.rentAmount : undefined,
      }));

      setTargets(mapped);
      if (!form.targetId && mapped.length > 0) {
        const firstWithLease = mapped.find((item) => !!item.leaseId) ?? mapped[0];
        setForm((prev) => ({
          ...prev,
          targetId: firstWithLease.id,
          amountDue: firstWithLease.rentAmount != null ? String(firstWithLease.rentAmount) : prev.amountDue,
        }));
      }
      return mapped;
    } catch {
      // ignore
      return [];
    }
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    let selectedTarget = targets.find((item) => item.id === form.targetId);
    if (!selectedTarget) {
      setError("Selectionne un locataire.");
      return;
    }

    if (!selectedTarget.leaseId && selectedTarget.propertyId) {
      try {
        const linkRes = await fetch(`${API_URL}/tenants/${selectedTarget.id}`, {
          method: "PATCH",
          headers: { ...apiHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPropertyId: selectedTarget.propertyId,
            monthlyIncome: selectedTarget.rentAmount,
          }),
        });

        if (linkRes.ok) {
          const refreshedTargets = await loadTargets();
          selectedTarget = refreshedTargets.find((item) => item.id === form.targetId) ?? selectedTarget;
        }
      } catch {
        // ignore, on garde le message explicite ci-dessous
      }
    }

    if (!selectedTarget.leaseId) {
      setError("Aucun bail actif pour ce locataire. Liez un bail depuis Locataires (choix du bien), puis reessayez.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/payments`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          leaseId: selectedTarget.leaseId,
          tenantName: selectedTarget.fullName,
          tenantEmail: selectedTarget.email,
          dueDate: new Date(form.dueDate).toISOString(),
          amountDue: Number(form.amountDue),
        }),
      });

      if (!response.ok) {
        throw new Error("Creation paiement impossible");
      }

      setShowCreateForm(false);
      setMessage("Paiement créé avec succès.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function markAsPaid(id: string, amountDue: number) {
    setMessage(null);
    setBusyAction(`paid-${id}`);
    try {
      const response = await fetch(`${API_URL}/payments/${id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paye", amountPaid: amountDue, paidAt: new Date().toISOString(), lateDays: 0 }),
      });

      if (!response.ok) {
        throw new Error("Mise a jour impossible");
      }

      await loadData();
      setMessage("Paiement marqué comme payé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyAction(null);
    }
  }

  async function generateReceipt(id: string) {
    setMessage(null);
    setBusyAction(`receipt-${id}`);
    try {
      const response = await fetch(`${API_URL}/payments/${id}/receipt`, {
        method: "POST",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error("Generation de quittance impossible");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fileName = `quittance-${id}.pdf`;
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setMessage("Quittance générée et téléchargée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyAction(null);
    }
  }

  async function sendReminder(id: string) {
    setMessage(null);
    setBusyAction(`reminder-${id}`);
    try {
      const response = await fetch(`${API_URL}/payments/${id}/reminder`, {
        method: "POST",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error("Envoi du rappel impossible");
      }

      setMessage("Rappel envoyé avec succès.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyAction(null);
    }
  }

  function startEdit(payment: Payment) {
    setEditForm({
      id: payment.id,
      dueDate: new Date(payment.dueDate).toISOString().slice(0, 10),
      amountDue: String(payment.amountDue),
      amountPaid: payment.amountPaid != null ? String(payment.amountPaid) : "",
      lateDays: String(payment.lateDays ?? 0),
      status: payment.status,
      notes: "",
    });
    setShowCreateForm(false);
    setShowEditForm(true);
  }

  async function submitEditPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await fetch(`${API_URL}/payments/${editForm.id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status,
          amountPaid: editForm.amountPaid ? Number(editForm.amountPaid) : undefined,
          paidAt: editForm.status === "paye" ? new Date().toISOString() : undefined,
          lateDays: Number(editForm.lateDays || 0),
          notes: editForm.notes || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Modification paiement impossible (${response.status})`);
      }

      setShowEditForm(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function deletePayment(id: string) {
    const confirmed = window.confirm("Supprimer ce paiement ?");
    if (!confirmed) {
      return;
    }

    setMessage(null);
    setBusyAction(`delete-${id}`);
    try {
      const response = await fetch(`${API_URL}/payments/${id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Suppression paiement impossible (${response.status})`);
      }

      await loadData();
      setMessage("Paiement supprimé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void Promise.all([loadData(), loadTargets()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTargets = targets.filter((item) => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return true;
    return `${item.fullName} ${item.email} ${item.propertyReference ?? item.propertyId ?? ""} ${item.leaseReference ?? item.leaseId ?? ""}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (filteredTargets.length === 0) {
      if (form.targetId !== "") {
        setForm((prev) => ({ ...prev, targetId: "" }));
      }
      return;
    }

    if (!filteredTargets.some((item) => item.id === form.targetId)) {
      const next = filteredTargets.find((item) => !!item.leaseId) ?? filteredTargets[0];
      setForm((prev) => ({
        ...prev,
        targetId: next.id,
        amountDue: next.rentAmount != null ? String(next.rentAmount) : prev.amountDue,
      }));
    }
  }, [filteredTargets, form.targetId]);

  const selectedTarget = filteredTargets.find((item) => item.id === form.targetId);
  const selectedPropertyMeta = selectedTarget?.propertyId ? propertyMetaByKey[selectedTarget.propertyId] : undefined;
  const selectedPropertyReference = selectedTarget?.propertyReference ?? selectedPropertyMeta?.reference ?? selectedTarget?.propertyId;
  const selectedLeaseReference = selectedTarget?.leaseReference ?? selectedTarget?.leaseId;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">Gestion des Paiements</h1>
              <p className="mt-2 text-sm text-slate-600">Suivi des loyers, statuts et alertes automatiques.</p>
              <p className="mt-1 text-xs text-slate-500">Regles applicables: droit locatif de la Republique de Cote d'Ivoire.</p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouveau paiement"}
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Alertes totales</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{alerts?.totalAlerts ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Retards</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{alerts?.lateCount ?? 0}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Impayes</p>
            <p className="mt-2 text-2xl font-semibold text-red-700">{alerts?.unpaidCount ?? 0}</p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {canManage && showCreateForm ? (
            <form onSubmit={createPayment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-brand-900">Ajouter un paiement</h2>
              <div className="mt-4 space-y-3">
                <input
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                  placeholder="Rechercher locataire (nom, email, bien)..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <label className="block text-sm text-slate-700">
                  Locataire cible
                  <select
                    value={form.targetId}
                    onChange={(e) => {
                      const next = filteredTargets.find((item) => item.id === e.target.value);
                      setForm((prev) => ({
                        ...prev,
                        targetId: e.target.value,
                        amountDue: next?.rentAmount != null ? String(next.rentAmount) : prev.amountDue,
                      }));
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    {filteredTargets.length === 0 ? (
                      <option value="">Aucun locataire trouvé</option>
                    ) : (
                      filteredTargets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fullName} - {item.email} - {item.propertyReference ?? item.propertyId ?? "sans bien"}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p>Référence bien: {selectedPropertyReference ?? "non renseigné"}</p>
                  <p>Numéro bail: {selectedLeaseReference ?? "non renseigné"}</p>
                  <p>Désignation: {selectedPropertyMeta?.label ?? "non renseignée"}</p>
                  <p>Loyer de référence: {selectedTarget?.rentAmount != null ? `${selectedTarget.rentAmount.toLocaleString("fr-FR")} FCFA` : "non disponible"}</p>
                  {selectedTarget && !selectedTarget.leaseId && (
                    <p className="mt-2">
                      <Link
                        href={`/locataires?search=${encodeURIComponent(selectedTarget.email)}`}
                        className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Associer un bail depuis Locataires
                      </Link>
                    </p>
                  )}
                </div>
                <input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={form.amountDue} onChange={(e) => setForm((prev) => ({ ...prev, amountDue: e.target.value }))} placeholder="Montant" />
                <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">Creer</button>
              </div>
            </form>
          ) : canManage && showEditForm ? (
            <form onSubmit={submitEditPayment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-brand-900">Modifier un paiement</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-slate-700">
                  Echéance
                  <input
                    type="date"
                    disabled
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    value={editForm.dueDate}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Montant dû
                  <input
                    disabled
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    value={editForm.amountDue}
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Statut
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as "paye" | "retard" | "impaye" }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="retard">retard</option>
                    <option value="impaye">impaye</option>
                    <option value="paye">paye</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  Montant payé
                  <input
                    value={editForm.amountPaid}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, amountPaid: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Jours de retard
                  <input
                    value={editForm.lateDays}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, lateDays: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Notes
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">Enregistrer</button>
                  <button
                    type="button"
                    onClick={() => setShowEditForm(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </form>
          ) : !canManage ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-700">Mode lecture seule</h2>
              <p className="mt-2 text-sm text-slate-500">Votre rôle peut consulter les paiements et alertes uniquement.</p>
            </article>
          ) : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canManage && showCreateForm ? "xl:col-span-2" : "xl:col-span-3"}`}>
            <h2 className="text-lg font-semibold text-brand-900">Suivi des paiements</h2>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-4">Locataire</th>
                    <th className="py-2 pr-4">Références</th>
                    <th className="py-2 pr-4">Echeance</th>
                    <th className="py-2 pr-4">Montant</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2 pr-4 text-slate-700">{payment.tenantName}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        <p className="font-medium">{payment.leaseReference ?? payment.leaseId}</p>
                        <p className="text-xs text-slate-500">{payment.propertyReference ?? "Bien non renseigné"}</p>
                        <p className="text-xs text-slate-400">{payment.propertyTitle ?? ""}</p>
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{new Date(payment.dueDate).toLocaleDateString("fr-FR")}</td>
                      <td className="py-2 pr-4 text-slate-700">{payment.amountDue.toLocaleString("fr-FR")} FCFA</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${payment.status === "paye" ? "bg-emerald-100 text-emerald-700" : payment.status === "retard" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {canManage && payment.status !== "paye" && (
                            <button
                              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              onClick={() => markAsPaid(payment.id, payment.amountDue)}
                              disabled={busyAction === `paid-${payment.id}`}
                            >
                              {busyAction === `paid-${payment.id}` ? "Traitement..." : "Marquer paye"}
                            </button>
                          )}
                          {canManage ? (
                            <>
                              <button
                                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                                onClick={() => startEdit(payment)}
                              >
                                Modifier
                              </button>
                              <button
                                className="rounded-lg border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-900 hover:bg-brand-50"
                                onClick={() => generateReceipt(payment.id)}
                                disabled={busyAction === `receipt-${payment.id}`}
                              >
                                {busyAction === `receipt-${payment.id}` ? "Generation..." : "Quittance PDF"}
                              </button>
                              <button
                                className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                                onClick={() => sendReminder(payment.id)}
                                  disabled={busyAction === `reminder-${payment.id}`}
                              >
                                  {busyAction === `reminder-${payment.id}` ? "Envoi..." : "Envoyer rappel"}
                              </button>
                              <button
                                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                onClick={() => deletePayment(payment.id)}
                                  disabled={busyAction === `delete-${payment.id}`}
                              >
                                  {busyAction === `delete-${payment.id}` ? "Suppression..." : "Supprimer"}
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Lecture seule</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
