"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { BiensCarteProperty } from "../components/BiensCarte";
import { useAuth } from "../context/auth";
import { exportVisibleRowsToCsv } from "../lib/csv";
import { fetchWithRetry } from "../lib/network";

// Chargement côté client uniquement (Leaflet requiert le DOM)
const BiensCarte = dynamic(() => import("../components/BiensCarte"), { ssr: false });

type Property = {
  id: string;
  reference: string;
  title: string;
  propertyType: "apartment" | "house" | "studio" | "land";
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  rentAmount: number;
  chargesAmount: number;
  ownerId: string;
  agentId?: string;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

const defaultForm = {
  reference: "",
  title: "",
  propertyType: "apartment" as "apartment" | "house" | "studio" | "land",
  addressLine: "",
  city: "",
  postalCode: "",
  country: "Cote d'Ivoire",
  rentAmount: "",
  chargesAmount: "",
};

export default function BiensPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState<null | {
    id: string;
    title: string;
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
    rentAmount: string;
    chargesAmount: string;
  }>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "apartment" | "house" | "studio" | "land">("all");

  const { apiHeaders, user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "agent";
  const canDelete = user?.role === "admin";
  const filteredProperties = useMemo(
    () => (typeFilter === "all" ? properties : properties.filter((item) => item.propertyType === typeFilter)),
    [properties, typeFilter],
  );
  const totalRent = useMemo(() => filteredProperties.reduce((acc, p) => acc + p.rentAmount, 0), [filteredProperties]);

  async function loadProperties() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithRetry(
        () => fetch(`${API_URL}/properties`, { headers: apiHeaders }),
        { retries: 2, delayMs: 700 },
      );

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      const data = (await response.json()) as Property[];
      setProperties(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/properties`, {
        method: "POST",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          reference: form.reference.trim() || undefined,
          rentAmount: Number(form.rentAmount),
          chargesAmount: Number(form.chargesAmount || 0),
        }),
      });

      if (!response.ok) {
        throw new Error(`Creation impossible (${response.status})`);
      }

      setForm(defaultForm);
      setShowCreateForm(false);
      setTypeFilter("all");
      setMessage("Bien créé et visible dans la liste.");
      await loadProperties();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function handleDelete(property: Property) {
    if (!canDelete) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer le bien ${property.reference || property.id} et tous ses dossiers liés (baux, paiements, contrats) ?`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/properties/${property.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Suppression impossible (${response.status})`);
      }

      await loadProperties();
      setMessage("Bien supprimé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function startEdit(property: Property) {
    setEditForm({
      id: property.id,
      title: property.title,
      addressLine: property.addressLine,
      city: property.city,
      postalCode: property.postalCode,
      country: property.country,
      rentAmount: String(property.rentAmount),
      chargesAmount: String(property.chargesAmount),
    });
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) {
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_URL}/properties/${editForm.id}`, {
        method: "PATCH",
        headers: { ...apiHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          addressLine: editForm.addressLine,
          city: editForm.city,
          postalCode: editForm.postalCode,
          country: editForm.country,
          rentAmount: Number(editForm.rentAmount),
          chargesAmount: Number(editForm.chargesAmount || 0),
        }),
      });

      if (!response.ok) {
        throw new Error(`Modification impossible (${response.status})`);
      }

      setEditForm(null);
      await loadProperties();
      setMessage("Bien modifié avec succès.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    void loadProperties();
  }, []);

  function exportVisiblePropertiesCsv() {
    const rows = filteredProperties.map((property) => ({
      reference: property.reference || property.id,
      titre: property.title,
      type: property.propertyType,
      ville: property.city,
      loyer: `${property.rentAmount}`,
      charges: `${property.chargesAmount}`,
    }));

    exportVisibleRowsToCsv("biens-visibles.csv", rows, [
      { key: "reference", label: "Reference" },
      { key: "titre", label: "Titre" },
      { key: "type", label: "Type" },
      { key: "ville", label: "Ville" },
      { key: "loyer", label: "Loyer FCFA" },
      { key: "charges", label: "Charges FCFA" },
    ]);
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">Gestion des Biens</h1>
              <p className="mt-2 text-sm text-slate-600">Gestion des biens avec situation geographique (Cote d'Ivoire).</p>
              <p className="mt-1 text-xs text-slate-500">Juridiction appliquee: droit immobilier de la Republique de Cote d'Ivoire.</p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouveau bien"}
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total biens</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{filteredProperties.length}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Loyer cumule</p>
            <p className="mt-2 text-2xl font-semibold text-brand-900">{totalRent.toLocaleString("fr-FR")} FCFA</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Etat</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as "all" | "apartment" | "house" | "studio" | "land")}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="all">Tous les types</option>
                <option value="apartment">Appartement</option>
                <option value="house">Maison</option>
                <option value="studio">Studio</option>
                <option value="land">Terrain (vente)</option>
              </select>
              <span className="text-sm font-medium text-slate-700">{loading ? "Chargement..." : "Synchronise"}</span>
              <button
                onClick={() => exportVisiblePropertiesCsv()}
                className="rounded-lg border border-teal-300 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
              >
                Export CSV
              </button>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {canManage && showCreateForm ? (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
              <h2 className="text-lg font-semibold text-brand-900">Nouveau bien</h2>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {[
                  ["reference", "Reference (optionnelle)"] ,
                  ["title", "Titre"],
                  ["addressLine", "Adresse"],
                  ["city", "Ville"],
                  ["postalCode", "Code postal"],
                  ["rentAmount", "Loyer (FCFA)"],
                  ["chargesAmount", "Charges (FCFA)"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm text-slate-700">
                    {label}
                    <input
                      required={["title", "addressLine", "city", "postalCode", "rentAmount"].includes(field)}
                      value={form[field as keyof typeof form]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring"
                    />
                  </label>
                ))}

                <label className="text-sm text-slate-700">
                  Type de bien
                  <select
                    value={form.propertyType}
                    onChange={(e) => setForm((prev) => ({ ...prev, propertyType: e.target.value as "apartment" | "house" | "studio" | "land" }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring"
                  >
                    <option value="apartment">Appartement</option>
                    <option value="house">Maison</option>
                    <option value="studio">Studio</option>
                    <option value="land">Terrain (vente)</option>
                  </select>
                </label>

                <button
                  type="submit"
                  className="mt-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
                >
                  Ajouter le bien
                </button>
              </div>
            </form>
          ) : canManage && editForm ? (
            <form onSubmit={submitEdit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-1">
              <h2 className="text-lg font-semibold text-brand-900">Modifier le bien</h2>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {[
                  ["title", "Titre"],
                  ["addressLine", "Adresse"],
                  ["city", "Ville"],
                  ["postalCode", "Code postal"],
                  ["country", "Pays"],
                  ["rentAmount", "Loyer (FCFA)"],
                  ["chargesAmount", "Charges (FCFA)"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm text-slate-700">
                    {label}
                    <input
                      required
                      value={editForm[field as keyof typeof editForm]}
                      onChange={(e) => setEditForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-brand-500 focus:ring"
                    />
                  </label>
                ))}

                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </form>
          ) : !canManage ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm xl:col-span-1">
              <h2 className="text-lg font-semibold text-slate-700">Mode lecture seule</h2>
              <p className="mt-2 text-sm text-slate-500">
                Votre rôle peut consulter les biens mais ne peut pas créer ni modifier.
              </p>
            </article>
          ) : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canManage && showCreateForm ? "xl:col-span-2" : "xl:col-span-3"}`}>
            <h2 className="text-lg font-semibold text-brand-900">Liste des biens</h2>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {message && <p className="mt-3 text-sm text-green-700">{message}</p>}

            <div className="mobile-scroll-x mt-4 overflow-x-auto">
              <table className="mobile-table min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Titre</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Ville</th>
                    <th className="py-2 pr-4">Loyer</th>
                    <th className="py-2 pr-4">Charges</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProperties.map((property) => (
                    <tr key={property.id}>
                      <td className="py-2 pr-4 font-medium text-slate-800">{property.reference || property.id}</td>
                      <td className="py-2 pr-4 text-slate-700">{property.title}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {property.propertyType === "apartment"
                          ? "Appartement"
                          : property.propertyType === "house"
                            ? "Maison"
                            : property.propertyType === "studio"
                              ? "Studio"
                              : "Terrain"}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{property.city}</td>
                      <td className="py-2 pr-4 text-slate-700">{property.rentAmount.toLocaleString("fr-FR")} FCFA</td>
                      <td className="py-2 pr-4 text-slate-700">{property.chargesAmount.toLocaleString("fr-FR")} FCFA</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          {canManage && (
                            <button
                              onClick={() => startEdit(property)}
                              className="rounded-lg border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              Modifier
                            </button>
                          )}
                          {canDelete ? (
                            <button
                              onClick={() => void handleDelete(property)}
                              className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Supprimer
                            </button>
                          ) : !canManage ? (
                            <span className="text-xs text-slate-400">Lecture seule</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Carte géographique des biens */}
        {filteredProperties.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Carte des biens</h2>
            <p className="mb-3 text-xs text-slate-500">
              Villes reconnues affichées sur la carte. Source: OpenStreetMap.
            </p>
            <div className="h-80 overflow-hidden rounded-xl">
              <BiensCarte
                properties={filteredProperties as BiensCarteProperty[]}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
