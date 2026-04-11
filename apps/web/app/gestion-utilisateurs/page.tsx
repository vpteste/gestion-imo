"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/auth";

type UserRole = "admin" | "agent" | "proprietaire" | "locataire";
type ManagedRole = Exclude<UserRole, "locataire">;

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: "pending" | "active" | "suspended";
  identityLinks?: {
    propertyId?: string;
    propertyIds?: string[];
    leaseId?: string;
    agency?: string;
  };
};

type Property = {
  id: string;
  reference: string;
};

type Tenant = {
  leaseId?: string;
  leaseReference?: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function GestionUtilisateursPage() {
  const { apiHeaders, user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastActivationToken, setLastActivationToken] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"tous" | ManagedRole>("tous");
  const [statusFilter, setStatusFilter] = useState<"tous" | ManagedUser["status"]>("tous");
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [editingLinksUserId, setEditingLinksUserId] = useState<string | null>(null);
  const [savingLinksUserId, setSavingLinksUserId] = useState<string | null>(null);
  const [linksForm, setLinksForm] = useState({
    propertyId: "",
    leaseId: "",
    propertyIdsCsv: "",
    agency: "",
  });
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "done" | "error">("idle");
  const [propertyReferenceByKey, setPropertyReferenceByKey] = useState<Record<string, string>>({});
  const [leaseReferenceById, setLeaseReferenceById] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ManagedRole>("agent");
  const canAdmin = currentUser?.role === "admin";

  const ROLE_LABELS: Record<UserRole, string> = {
    admin: "Admin",
    agent: "Agent",
    proprietaire: "Proprietaire",
    locataire: "Locataire",
  };

  const ROLE_COLORS: Record<UserRole, string> = {
    admin: "bg-indigo-100 text-indigo-700 border-indigo-200",
    agent: "bg-cyan-100 text-cyan-700 border-cyan-200",
    proprietaire: "bg-emerald-100 text-emerald-700 border-emerald-200",
    locataire: "bg-violet-100 text-violet-700 border-violet-200",
  };

  const STATUS_LABELS: Record<ManagedUser["status"], string> = {
    pending: "En attente",
    active: "Actif",
    suspended: "Suspendu",
  };

  const STATUS_COLORS: Record<ManagedUser["status"], string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    active: "bg-green-100 text-green-700 border-green-200",
    suspended: "bg-rose-100 text-rose-700 border-rose-200",
  };

  function buildAutoId(prefix: string, source: string): string {
    const initials = source
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 3)
      .padEnd(2, "X");
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefix}-${initials}-${stamp}-${rand}`;
  }

  async function loadUsers(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/users`, { headers: apiHeaders });
      if (!res.ok) {
        throw new Error(`Erreur users (${res.status})`);
      }
      setUsers((await res.json()) as ManagedUser[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [apiHeaders]);

  useEffect(() => {
    async function loadReferenceMaps() {
      try {
        const [propertiesRes, tenantsRes] = await Promise.all([
          fetch(`${API_URL}/properties`, { headers: apiHeaders }),
          fetch(`${API_URL}/tenants`, { headers: apiHeaders }),
        ]);

        if (propertiesRes.ok) {
          const properties = (await propertiesRes.json()) as Property[];
          const map: Record<string, string> = {};
          for (const property of properties) {
            map[property.id] = property.reference;
            map[property.reference] = property.reference;
          }
          setPropertyReferenceByKey(map);
        }

        if (tenantsRes.ok) {
          const tenants = (await tenantsRes.json()) as Tenant[];
          const leaseMap: Record<string, string> = {};
          for (const tenant of tenants) {
            if (tenant.leaseId && tenant.leaseReference) {
              leaseMap[tenant.leaseId] = tenant.leaseReference;
            }
          }
          setLeaseReferenceById(leaseMap);
        }
      } catch {
        // ignore
      }
    }

    void loadReferenceMaps();
  }, [apiHeaders]);

  async function provision(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLastActivationToken(null);

    const identityLinks: Record<string, unknown> =
      role === "proprietaire"
          ? { propertyIds: [buildAutoId("PROP", fullName)] }
          : role === "agent"
            ? { agency: `AGENCE-${buildAutoId("AG", fullName)}` }
            : {};

    try {
      const res = await fetch(`${API_URL}/auth/users/provision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({
          email,
          fullName,
          role,
          identityLinks,
        }),
      });

      if (!res.ok) {
        throw new Error(`Provisioning impossible (${res.status})`);
      }

      const payload = await res.json();
      setLastActivationToken(payload?.activation?.token ?? null);
      setEmail("");
      setFullName("");
      setShowCreateForm(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function suspendUser(id: string) {
    setError(null);
    setSuspendingId(id);
    try {
      const res = await fetch(`${API_URL}/auth/users/${id}/suspend`, {
        method: "PATCH",
        headers: apiHeaders,
      });

      if (!res.ok) {
        throw new Error(`Suspension impossible (${res.status})`);
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSuspendingId(null);
    }
  }

  async function changeRole(userId: string, nextRole: ManagedRole, currentLinks?: ManagedUser["identityLinks"]) {
    setError(null);
    setUpdatingRoleId(userId);

    const nextIdentityLinks =
      nextRole === "proprietaire"
          ? {
              propertyIds: currentLinks?.propertyIds && currentLinks.propertyIds.length > 0
                ? currentLinks.propertyIds
                : currentLinks?.propertyId
                  ? [currentLinks.propertyId]
                  : undefined,
            }
          : nextRole === "agent"
            ? { agency: currentLinks?.agency ?? "AGENCE-STD" }
            : undefined;

    try {
      const res = await fetch(`${API_URL}/auth/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({
          role: nextRole,
          identityLinks: nextIdentityLinks,
        }),
      });

      if (!res.ok) {
        throw new Error(`Changement de role impossible (${res.status})`);
      }

      await loadUsers(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  async function reactivateUser(id: string) {
    setError(null);
    setReactivatingId(id);
    try {
      const res = await fetch(`${API_URL}/auth/users/${id}/reactivate`, {
        method: "PATCH",
        headers: apiHeaders,
      });

      if (!res.ok) {
        throw new Error(`Reactivation impossible (${res.status})`);
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setReactivatingId(null);
    }
  }

  async function copyActivationToken() {
    if (!lastActivationToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(lastActivationToken);
      setCopyFeedback("done");
      setTimeout(() => setCopyFeedback("idle"), 1400);
    } catch {
      setCopyFeedback("error");
      setTimeout(() => setCopyFeedback("idle"), 1400);
    }
  }

  function openIdentityEditor(item: ManagedUser) {
    setEditingLinksUserId(item.id);
    setLinksForm({
      propertyId: item.identityLinks?.propertyId ?? "",
      leaseId: item.identityLinks?.leaseId ?? "",
      propertyIdsCsv: item.identityLinks?.propertyIds?.join(", ") ?? "",
      agency: item.identityLinks?.agency ?? "",
    });
  }

  function normalizeIdentityLinksByRole(roleValue: UserRole): ManagedUser["identityLinks"] {
    const agency = linksForm.agency.trim();
    const propertyIds = linksForm.propertyIdsCsv
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (roleValue === "proprietaire") {
      return {
        propertyIds: propertyIds.length > 0 ? propertyIds : undefined,
      };
    }

    if (roleValue === "agent") {
      return {
        agency: agency || undefined,
      };
    }

    return undefined;
  }

  async function saveIdentityLinks(item: ManagedUser) {
    setError(null);
    setSavingLinksUserId(item.id);

    const identityLinks = normalizeIdentityLinksByRole(item.role);
    if (item.role === "admin") {
      setError("Le couplage ne s'applique pas au role admin.");
      setSavingLinksUserId(null);
      return;
    }
    if (item.role === "proprietaire" && (!identityLinks?.propertyIds || identityLinks.propertyIds.length === 0)) {
      setError("Pour un proprietaire, renseigne au moins un bien dans la liste.");
      setSavingLinksUserId(null);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/users/${item.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({
          role: item.role,
          identityLinks,
        }),
      });

      if (!res.ok) {
        throw new Error(`Mise a jour du couplage impossible (${res.status})`);
      }

      setEditingLinksUserId(null);
      await loadUsers(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSavingLinksUserId(null);
    }
  }

  function renderIdentityLinks(identityLinks?: ManagedUser["identityLinks"]) {
    if (!identityLinks) {
      return <span className="text-slate-300">-</span>;
    }

    const chunks: string[] = [];
    if (identityLinks.propertyId) {
      const propertyRef = propertyReferenceByKey[identityLinks.propertyId] ?? identityLinks.propertyId;
      chunks.push(`Bien: ${propertyRef}`);
    }
    if (identityLinks.leaseId) {
      const leaseRef = leaseReferenceById[identityLinks.leaseId] ?? identityLinks.leaseId;
      chunks.push(`Bail: ${leaseRef}`);
    }
    if (identityLinks.propertyIds?.length) {
      const refs = identityLinks.propertyIds.map((item) => propertyReferenceByKey[item] ?? item);
      chunks.push(`Biens: ${refs.join(", ")}`);
    }
    if (identityLinks.agency) chunks.push(`Agence: ${identityLinks.agency}`);

    if (chunks.length === 0) {
      return <span className="text-slate-300">-</span>;
    }

    return chunks.map((line) => (
      <p key={line} className="truncate" title={line}>{line}</p>
    ));
  }

  const managementUsers = users.filter((item) => item.role !== "locataire");

  const filteredUsers = managementUsers.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || [item.fullName, item.email, item.role, item.status].join(" ").toLowerCase().includes(q);
    const matchesRole = roleFilter === "tous" || item.role === roleFilter;
    const matchesStatus = statusFilter === "tous" || item.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const kpis = {
    total: managementUsers.length,
    pending: managementUsers.filter((u) => u.status === "pending").length,
    active: managementUsers.filter((u) => u.status === "active").length,
    suspended: managementUsers.filter((u) => u.status === "suspended").length,
  };

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Gestion des utilisateurs</h1>
              <p className="mt-1 text-sm text-slate-500">
                Comptes de gestion uniquement: admin, agent, proprietaire.
              </p>
              <p className="mt-1 text-xs text-slate-500">Cadre de conformite: dispositions juridiques en vigueur en Republique de Cote d'Ivoire.</p>
              <p className="mt-1 text-xs text-slate-500">Les locataires se gerent depuis la page Locataires, pas ici.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void loadUsers(true)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {refreshing ? "Actualisation..." : "Actualiser"}
              </button>
              {canAdmin && (
                <button
                  onClick={() => setShowCreateForm((prev) => !prev)}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  {showCreateForm ? "Fermer le formulaire" : "+ Nouvel utilisateur"}
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.total}</p>
          </article>
          <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-amber-700">En attente</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{kpis.pending}</p>
          </article>
          <article className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-green-700">Actifs</p>
            <p className="mt-1 text-2xl font-bold text-green-900">{kpis.active}</p>
          </article>
          <article className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-rose-700">Suspendus</p>
            <p className="mt-1 text-2xl font-bold text-rose-900">{kpis.suspended}</p>
          </article>
        </section>

        {canAdmin && showCreateForm && (
        <form onSubmit={provision} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Nom complet" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as ManagedRole)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="admin">admin</option>
            <option value="agent">agent</option>
            <option value="proprietaire">proprietaire</option>
          </select>
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-2">
            Les identifiants metier (propertyId, leaseId, agence) sont generes automatiquement a partir des initiales.
          </p>
          <button type="submit" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Provisionner</button>
        </form>
        )}

        {lastActivationToken && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Token d&apos;activation (dev)</p>
            <p className="mt-1 break-all">{lastActivationToken}</p>
            <button
              type="button"
              onClick={() => void copyActivationToken()}
              className="mt-2 rounded border border-amber-300 bg-white/70 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-white"
            >
              {copyFeedback === "done" ? "Copie" : copyFeedback === "error" ? "Echec copie" : "Copier"}
            </button>
          </section>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email, role ou statut..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "tous" | ManagedRole)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="tous">Tous les roles</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
              <option value="proprietaire">Proprietaire</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "tous" | ManagedUser["status"])}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="tous">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="active">Actif</option>
              <option value="suspended">Suspendu</option>
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Utilisateur</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Rôle</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Statut</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Couplage</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Chargement...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Aucun utilisateur</td></tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 text-slate-700">
                        {user.fullName}
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {canAdmin ? (
                          <select
                            disabled={updatingRoleId === user.id || user.id === currentUser?.id}
                            value={user.role}
                            onChange={(e) => void changeRole(user.id, e.target.value as ManagedRole, user.identityLinks)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="admin">Admin</option>
                            <option value="agent">Agent</option>
                            <option value="proprietaire">Proprietaire</option>
                          </select>
                        ) : (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ROLE_COLORS[user.role]}`}>
                            {ROLE_LABELS[user.role]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[user.status]}`}>
                          {STATUS_LABELS[user.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{renderIdentityLinks(user.identityLinks)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canAdmin && (user.role === "agent" || user.role === "proprietaire") && (
                            <button
                              type="button"
                              onClick={() => openIdentityEditor(user)}
                              className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                            >
                              Editer couplage
                            </button>
                          )}
                          {canAdmin && user.status !== "suspended" && user.id !== currentUser?.id && (
                            <button
                              onClick={() => void suspendUser(user.id)}
                              disabled={suspendingId === user.id}
                              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {suspendingId === user.id ? "Suspension..." : "Suspendre"}
                            </button>
                          )}
                          {canAdmin && user.status === "suspended" && user.id !== currentUser?.id && (
                            <button
                              onClick={() => void reactivateUser(user.id)}
                              disabled={reactivatingId === user.id}
                              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {reactivatingId === user.id ? "Reactivation..." : "Reactiver"}
                            </button>
                          )}
                          {user.id === currentUser?.id && (
                            <span className="text-xs text-slate-400">Compte courant</span>
                          )}
                        </div>
                        {editingLinksUserId === user.id && (
                          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                            {user.role === "proprietaire" && (
                              <input
                                value={linksForm.propertyIdsCsv}
                                onChange={(e) => setLinksForm((prev) => ({ ...prev, propertyIdsCsv: e.target.value }))}
                                placeholder="propertyIds (ex: prop-a, prop-b)"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                            )}
                            {user.role === "agent" && (
                              <input
                                value={linksForm.agency}
                                onChange={(e) => setLinksForm((prev) => ({ ...prev, agency: e.target.value }))}
                                placeholder="agency"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void saveIdentityLinks(user)}
                                disabled={savingLinksUserId === user.id}
                                className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {savingLinksUserId === user.id ? "Enregistrement..." : "Enregistrer"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLinksUserId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
