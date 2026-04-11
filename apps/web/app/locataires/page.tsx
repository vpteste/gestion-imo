"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../context/auth";

type TenantStatus = "actif" | "inactif" | "en_attente";

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  currentPropertyId?: string;
  currentPropertyReference?: string;
  leaseId?: string;
  leaseReference?: string;
  monthlyIncome?: number;
  status: TenantStatus;
  createdAt: string;
  activation?: {
    token?: string;
    expiresAt: string;
  };
};

type Property = {
  id: string;
  reference: string;
  title: string;
  city: string;
  rentAmount: number;
};

const STATUS_LABELS: Record<TenantStatus, string> = {
  actif:      "Actif",
  inactif:    "Inactif",
  en_attente: "En attente",
};

const STATUS_COLORS: Record<TenantStatus, string> = {
  actif:      "bg-green-100 text-green-800",
  inactif:    "bg-slate-100 text-slate-600",
  en_attente: "bg-amber-100 text-amber-800",
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

const defaultForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  propertyKey: "",
};

const defaultEditForm = {
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  propertyKey: "",
  monthlyIncome: "",
};

export default function LocatairesPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [message, setMessage]     = useState<string | null>(null);
  const [form, setForm]           = useState(defaultForm);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [leaseLinkingTenantId, setLeaseLinkingTenantId] = useState<string | null>(null);
  const [filterStatus, setFilter] = useState<string>("tous");
  const [search, setSearch] = useState("");
  const { apiHeaders, user }      = useAuth();
  const canManage                 = user?.role === "admin" || user?.role === "agent";
  const canDelete                 = user?.role === "admin";

  async function loadProperties() {
    try {
      const response = await fetch(`${API_URL}/properties`, { headers: apiHeaders });
      if (!response.ok) return;
      setProperties((await response.json()) as Property[]);
    } catch {
      // ignore
    }
  }

  async function loadTenants() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/tenants`, { headers: apiHeaders });

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      setTenants((await response.json()) as Tenant[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const selectedProperty = properties.find(
      (item) => item.id === form.propertyKey || item.reference === form.propertyKey,
    );
    if (!selectedProperty) {
      setError("Selectionne un bien pour lier le locataire et le loyer.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tenants`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          monthlyIncome: Number(selectedProperty.rentAmount),
          currentPropertyId: selectedProperty.id,
          phone: form.phone || undefined,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as Tenant | { message?: string };

      if (!response.ok) {
        throw new Error((body as { message?: string }).message ?? `Erreur (${response.status})`);
      }

      if ("activation" in body && body.activation?.token) {
        setMessage(`Compte locataire créé. Token d'activation: ${body.activation.token} (expire le ${new Date(body.activation.expiresAt).toLocaleString("fr-FR")}).`);
      } else if ("activation" in body && body.activation?.expiresAt) {
        setMessage(`Compte locataire créé. L'activation expire le ${new Date(body.activation.expiresAt).toLocaleString("fr-FR")}.`);
      } else {
        setMessage("Locataire créé avec succès.");
      }

      setForm(defaultForm);
      setShowCreateForm(false);
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function updateStatus(id: string, status: TenantStatus) {
    try {
      const response = await fetch(`${API_URL}/tenants/${id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Mise à jour impossible");
      }

      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function startEdit(tenant: Tenant) {
    setEditForm({
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email,
      phone: tenant.phone ?? "",
      propertyKey: tenant.currentPropertyId ?? "",
      monthlyIncome: tenant.monthlyIncome != null ? String(tenant.monthlyIncome) : "",
    });
    setShowCreateForm(false);
    setShowEditForm(true);
  }

  async function linkLease(tenant: Tenant) {
    if (!tenant.currentPropertyId) {
      startEdit(tenant);
      return;
    }

    setLeaseLinkingTenantId(tenant.id);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPropertyId: tenant.currentPropertyId,
          monthlyIncome: tenant.monthlyIncome,
        }),
      });

      if (!response.ok) {
        throw new Error(`Association bail impossible (${response.status})`);
      }

      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLeaseLinkingTenantId(null);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editForm.id) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tenants/${editForm.id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          phone: editForm.phone || undefined,
          currentPropertyId: editForm.propertyKey || undefined,
          monthlyIncome: editForm.monthlyIncome ? Number(editForm.monthlyIncome) : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Modification impossible (${response.status})`);
      }

      setShowEditForm(false);
      setEditForm(defaultEditForm);
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function deleteTenant(tenant: Tenant) {
    if (!canDelete) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${tenant.firstName} ${tenant.lastName} et tous ses dossiers liés (baux, paiements, contrats) ?`,
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tenants/${tenant.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Suppression impossible (${response.status})`);
      }

      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    void Promise.all([loadTenants(), loadProperties()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prefillSearch = searchParams.get("search")?.trim();
    if (!prefillSearch) {
      return;
    }

    setSearch(prefillSearch);
  }, [searchParams]);

  const selectedProperty = properties.find(
    (item) => item.id === form.propertyKey || item.reference === form.propertyKey,
  );

  const propertyReferenceById = Object.fromEntries(
    properties.map((property) => [property.id, property.reference]),
  ) as Record<string, string>;

  const displayed =
    filterStatus === "tous"
      ? tenants
      : tenants.filter((t) => t.status === filterStatus);

  const filtered = displayed.filter((tenant) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [
      tenant.firstName,
      tenant.lastName,
      tenant.email,
      tenant.currentPropertyReference ?? "",
      tenant.leaseReference ?? "",
      tenant.currentPropertyId ?? "",
      tenant.leaseId ?? "",
    ].join(" ").toLowerCase().includes(q);
  });

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">

        {/* En-tête */}
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Gestion des Locataires</h1>
              <p className="mt-1 text-sm text-slate-500">
                Profils, rattachement geo des biens et suivi des statuts.
              </p>
              <p className="mt-1 text-xs text-slate-500">Regles applicables: droit immobilier de la Republique de Cote d'Ivoire.</p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouveau locataire"}
              </button>
            )}
          </div>
        </header>

        {/* KPI */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["tous", "actif", "en_attente", "inactif"] as const).map((s) => {
            const count = s === "tous" ? tenants.length : tenants.filter((t) => t.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-2xl border p-4 text-left shadow-sm transition-all ${
                  filterStatus === s
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {s === "tous" ? "Tous" : STATUS_LABELS[s as TenantStatus]}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{count}</p>
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Formulaire création */}
          {canManage && showCreateForm ? (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1 space-y-3">
              <h2 className="text-base font-semibold text-slate-800">Nouveau locataire</h2>

              {[
                ["firstName",        "Prénom",          "text",   true],
                ["lastName",         "Nom",             "text",   true],
                ["email",            "E-mail",          "email",  true],
                ["phone",            "Téléphone",       "tel",    false],
              ].map(([field, label, type, required]) => (
                <label key={field as string} className="block text-xs font-medium text-slate-700">
                  {label as string}
                  <input
                    type={type as string}
                    required={required as boolean}
                    value={form[field as keyof typeof form]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [field as string]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              ))}

              <label className="block text-xs font-medium text-slate-700">
                Bien associé
                <select
                  required
                  value={form.propertyKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, propertyKey: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Sélectionner un bien</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {(property.reference || property.id)} - {property.title} ({property.city})
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                <p>Loyer du bien: {selectedProperty ? `${selectedProperty.rentAmount.toLocaleString("fr-FR")} FCFA` : "non sélectionné"}</p>
                <p>Bail: généré automatiquement et lié au bien à la création.</p>
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
              {message && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Ajouter
              </button>
            </form>
          ) : canManage && showEditForm ? (
            <form onSubmit={submitEdit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1 space-y-3">
              <h2 className="text-base font-semibold text-slate-800">Modifier locataire</h2>

              {[
                ["firstName", "Prénom", "text", true],
                ["lastName", "Nom", "text", true],
                ["email", "E-mail", "email", true],
                ["phone", "Téléphone", "tel", false],
                ["monthlyIncome", "Loyer (FCFA)", "number", false],
              ].map(([field, label, type, required]) => (
                <label key={field as string} className="block text-xs font-medium text-slate-700">
                  {label as string}
                  <input
                    type={type as string}
                    required={required as boolean}
                    value={editForm[field as keyof typeof editForm]}
                    onChange={(ev) => setEditForm((prev) => ({ ...prev, [field as string]: ev.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              ))}

              <label className="block text-xs font-medium text-slate-700">
                Bien associé
                <select
                  value={editForm.propertyKey}
                  onChange={(ev) => setEditForm((prev) => ({ ...prev, propertyKey: ev.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Aucun bien</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {(property.reference || property.id)} - {property.title} ({property.city})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditForm(false);
                    setEditForm(defaultEditForm);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : !canManage ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm xl:col-span-1">
              <h2 className="text-base font-semibold text-slate-700">Mode lecture seule</h2>
              <p className="mt-2 text-sm text-slate-500">Votre rôle peut consulter les locataires mais pas en créer ni modifier.</p>
            </article>
          ) : null}

          {/* Table locataires */}
          <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canManage && showCreateForm ? "xl:col-span-2" : "xl:col-span-3"}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                Locataires{filterStatus !== "tous" ? ` — ${STATUS_LABELS[filterStatus as TenantStatus]}` : ""}
              </h2>
              <div className="flex items-center gap-2">
                {message && <span className="text-xs text-emerald-700">{message}</span>}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un locataire..."
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
                {loading && <span className="text-xs text-slate-400">Chargement…</span>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2 pr-4">E-mail</th>
                    <th className="py-2 pr-4">Bien</th>
                    <th className="py-2 pr-4">Bail</th>
                    <th className="py-2 pr-4">Loyer</th>
                    <th className="py-2 pr-4">Statut</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 font-medium text-slate-800">
                        {tenant.firstName} {tenant.lastName}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{tenant.email}</td>
                      <td className="py-2 pr-4 text-slate-500">
                        {tenant.currentPropertyReference
                          ?? (tenant.currentPropertyId ? propertyReferenceById[tenant.currentPropertyId] : undefined)
                          ?? tenant.currentPropertyId
                          ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {tenant.leaseReference ?? tenant.leaseId ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {tenant.monthlyIncome != null
                          ? `${tenant.monthlyIncome.toLocaleString("fr-FR")} FCFA`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[tenant.status]}`}>
                          {STATUS_LABELS[tenant.status]}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          {canManage && tenant.status !== "actif" && (
                            <button
                              onClick={() => void updateStatus(tenant.id, "actif")}
                              className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                            >
                              Activer
                            </button>
                          )}
                          {canManage && tenant.status === "actif" && (
                            <button
                              onClick={() => void updateStatus(tenant.id, "inactif")}
                              className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                            >
                              Désactiver
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => startEdit(tenant)}
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              Modifier
                            </button>
                          )}
                          {canManage && !tenant.leaseId && (
                            <button
                              onClick={() => void linkLease(tenant)}
                              disabled={leaseLinkingTenantId === tenant.id}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {leaseLinkingTenantId === tenant.id
                                ? "Association..."
                                : tenant.currentPropertyId
                                  ? "Associer bail"
                                  : "Affecter bien"}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => void deleteTenant(tenant)}
                              className="rounded-lg border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Supprimer
                            </button>
                          )}
                          {!canManage && <span className="text-xs text-slate-400">Lecture seule</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Aucun locataire trouvé.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
