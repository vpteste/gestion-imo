"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/auth";

type Contract = {
  id: string;
  propertyId: string;
  propertyReference?: string;
  propertyTitle?: string;
  propertyAddress?: string;
  leaseId?: string;
  leaseReference?: string;
  tenantName?: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "agent" | "proprietaire" | "locataire";
  status: "pending" | "active" | "suspended";
  identityLinks?: {
    propertyId?: string;
    leaseId?: string;
  };
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

type ContractTarget = {
  id: string;
  fullName: string;
  email: string;
  propertyId?: string;
  propertyReference?: string;
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

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

export default function ContratsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [targets, setTargets] = useState<ContractTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [propertyRentByKey, setPropertyRentByKey] = useState<Record<string, number>>({});
  const [propertyMetaByKey, setPropertyMetaByKey] = useState<Record<string, { reference: string; label: string }>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiHeaders, user } = useAuth();
  const canUpload = user?.role === "admin" || user?.role === "agent";

  function formatFcfa(value: number): string {
    return `${value.toLocaleString("fr-FR")} FCFA`;
  }

  async function loadContracts() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/contracts`, {
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status})`);
      }

      const data = (await response.json()) as Contract[];
      setContracts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function loadTargets() {
    if (!canUpload) return;
    const merged = new Map<string, ContractTarget>();

    try {
      const usersRes = await fetch(`${API_URL}/auth/users`, { headers: apiHeaders });
      if (usersRes.ok) {
        const users = (await usersRes.json()) as ManagedUser[];
        const locataires = users
          .filter((item) => item.role === "locataire")
          .map((item): ContractTarget => ({
            id: item.id,
            fullName: item.fullName,
            email: item.email,
            propertyId: item.identityLinks?.propertyId,
            leaseId: item.identityLinks?.leaseId,
          }));

        for (const item of locataires) {
          const existing = merged.get(item.id);
          merged.set(item.id, {
            id: item.id,
            fullName: item.fullName || existing?.fullName || "",
            email: item.email || existing?.email || "",
            propertyId: item.propertyId ?? existing?.propertyId,
            propertyReference: item.propertyReference ?? existing?.propertyReference,
            leaseId: item.leaseId ?? existing?.leaseId,
            leaseReference: item.leaseReference ?? existing?.leaseReference,
          });
        }
      }
    } catch {
      // fallback/fusion ci-dessous
    }

    try {
      const tenantsRes = await fetch(`${API_URL}/tenants`, { headers: apiHeaders });
      if (tenantsRes.ok) {
        const tenants = (await tenantsRes.json()) as Tenant[];
        const mapped = tenants.map((item): ContractTarget => ({
          id: item.id,
          fullName: `${item.firstName} ${item.lastName}`.trim(),
          email: item.email,
          propertyId: item.currentPropertyId,
          propertyReference: item.currentPropertyReference,
          leaseId: item.leaseId,
          leaseReference: item.leaseReference,
        }));

        for (const item of mapped) {
          const existing = merged.get(item.id);
          // Les données /tenants sont la source métier prioritaire pour bien/bail.
          merged.set(item.id, {
            id: item.id,
            fullName: item.fullName || existing?.fullName || "",
            email: item.email || existing?.email || "",
            propertyId: item.propertyId ?? existing?.propertyId,
            propertyReference: item.propertyReference ?? existing?.propertyReference,
            leaseId: item.leaseId ?? existing?.leaseId,
            leaseReference: item.leaseReference ?? existing?.leaseReference,
          });
        }
      }
    } catch {
      // ignore
    }

    const finalTargets = Array.from(merged.values());
    setTargets(finalTargets);
    if (finalTargets.length === 0) {
      setSelectedTargetId("");
      return;
    }

    const preferred = finalTargets.find((item) => !!item.propertyId) ?? finalTargets[0];
    if (!selectedTargetId || !finalTargets.some((item) => item.id === selectedTargetId)) {
      setSelectedTargetId(preferred.id);
    }
  }

  async function loadPropertiesForRent() {
    try {
      const response = await fetch(`${API_URL}/properties`, { headers: apiHeaders });
      if (!response.ok) return;
      const properties = (await response.json()) as Property[];
      const rentMap: Record<string, number> = {};
      const metaMap: Record<string, { reference: string; label: string }> = {};
      for (const item of properties) {
        rentMap[item.id] = item.rentAmount;
        rentMap[item.reference] = item.rentAmount;
        const meta = {
          reference: item.reference,
          label: `${item.title} - ${item.addressLine}, ${item.city}`,
        };
        metaMap[item.id] = meta;
        metaMap[item.reference] = meta;
      }
      setPropertyRentByKey(rentMap);
      setPropertyMetaByKey(metaMap);
    } catch {
      // ignore
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError("Selectionne un fichier avant l'envoi.");
      return;
    }

    const target = targets.find((item) => item.id === selectedTargetId);
    if (!target) {
      setError("Selectionne un locataire avant l'envoi.");
      return;
    }
    if (!target.propertyId) {
      setError("Le locataire selectionne n'a pas de bien rattache.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    const query = new URLSearchParams({ propertyId: target.propertyId });
    if (target.leaseId) {
      query.set("leaseId", target.leaseId);
    }

    try {
      const response = await fetch(`${API_URL}/contracts/upload?${query.toString()}`, {
        method: "POST",
        headers: apiHeaders,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload impossible (${response.status})`);
      }

      setSelectedFile(null);
      setShowCreateForm(false);
      await loadContracts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function downloadContract(contract: Contract) {
    try {
      const response = await fetch(`${API_URL}/contracts/${contract.id}/download`, {
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Telechargement impossible (${response.status})`);
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

  async function deleteContract(contract: Contract) {
    const confirmed = window.confirm(`Supprimer le contrat ${contract.fileName} ?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/contracts/${contract.id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!response.ok) {
        throw new Error(`Suppression impossible (${response.status})`);
      }

      await loadContracts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  useEffect(() => {
    void Promise.all([loadContracts(), loadTargets(), loadPropertiesForRent()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTargets = targets.filter((item) => {
    const q = targetSearch.trim().toLowerCase();
    if (!q) return true;
    return `${item.fullName} ${item.email} ${item.propertyReference ?? item.propertyId ?? ""} ${item.leaseReference ?? item.leaseId ?? ""}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (filteredTargets.length === 0) {
      setSelectedTargetId("");
      return;
    }

    if (!filteredTargets.some((item) => item.id === selectedTargetId)) {
      const preferred = filteredTargets.find((item) => !!item.propertyId) ?? filteredTargets[0];
      setSelectedTargetId(preferred.id);
      return;
    }

    const current = filteredTargets.find((item) => item.id === selectedTargetId);
    if (current && !current.propertyId) {
      const preferred = filteredTargets.find((item) => !!item.propertyId);
      if (preferred) {
        setSelectedTargetId(preferred.id);
      }
    }
  }, [filteredTargets, selectedTargetId]);

  const selectedTarget = filteredTargets.find((item) => item.id === selectedTargetId);
  const selectedRent = selectedTarget?.propertyId ? propertyRentByKey[selectedTarget.propertyId] : undefined;
  const selectedPropertyMeta = selectedTarget?.propertyId ? propertyMetaByKey[selectedTarget.propertyId] : undefined;
  const selectedPropertyReference = selectedTarget?.propertyReference ?? selectedPropertyMeta?.reference ?? selectedTarget?.propertyId;
  const selectedLeaseReference = selectedTarget?.leaseReference ?? selectedTarget?.leaseId;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">Gestion des Contrats</h1>
              <p className="mt-2 text-sm text-slate-600">Import, archivage, consultation et telechargement.</p>
              <p className="mt-1 text-xs text-slate-500">Cadre juridique applique: lois en vigueur en Republique de Cote d'Ivoire.</p>
            </div>
            {canUpload && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouveau contrat"}
              </button>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {canUpload && showCreateForm ? (
            <form onSubmit={handleUpload} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-brand-900">Importer un contrat</h2>
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
                    value={selectedTargetId}
                    onChange={(e) => setSelectedTargetId(e.target.value)}
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
                  <p>Loyer: {selectedRent != null ? formatFcfa(selectedRent) : "non disponible"}</p>
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

                <label className="block text-sm text-slate-700">
                  Fichier contrat
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="mt-1 w-full text-sm"
                  />
                </label>

                <button type="submit" className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">
                  Envoyer
                </button>
              </div>
            </form>
          ) : !canUpload ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-700">Mode lecture seule</h2>
              <p className="mt-2 text-sm text-slate-500">Votre rôle peut consulter et télécharger les contrats uniquement.</p>
            </article>
          ) : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canUpload && showCreateForm ? "xl:col-span-2" : "xl:col-span-3"}`}>
            <h2 className="text-lg font-semibold text-brand-900">Archives</h2>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {loading && <p className="mt-3 text-sm text-slate-600">Chargement...</p>}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 pr-4">Nom</th>
                    <th className="py-2 pr-4">Locataire</th>
                    <th className="py-2 pr-4">Bien</th>
                    <th className="py-2 pr-4">Bail</th>
                    <th className="py-2 pr-4">Loyer</th>
                    <th className="py-2 pr-4">Taille</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contracts.map((contract) => (
                    <tr key={contract.id}>
                      <td className="py-2 pr-4 text-slate-700">
                        <p className="font-medium">{contract.fileName}</p>
                        <p className="text-xs text-slate-400">{Math.round(contract.size / 1024)} KB</p>
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{contract.tenantName ?? "-"}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        <p className="font-medium">{contract.propertyReference ?? contract.propertyId}</p>
                        <p className="text-xs text-slate-500">{contract.propertyTitle ?? contract.propertyAddress ?? "-"}</p>
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{contract.leaseReference ?? contract.leaseId ?? "-"}</td>
                      <td className="py-2 pr-4 text-slate-700">
                        {propertyRentByKey[contract.propertyId] != null ? formatFcfa(propertyRentByKey[contract.propertyId]) : "-"}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{new Date(contract.uploadedAt).toLocaleString("fr-FR")}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => downloadContract(contract)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Telecharger
                          </button>
                          {canUpload && (
                            <button
                              type="button"
                              onClick={() => void deleteContract(contract)}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              Supprimer
                            </button>
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
