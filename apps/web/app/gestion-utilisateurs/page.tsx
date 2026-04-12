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
    agentCode?: string;
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

type ActivityLog = {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs?: number;
};

type AgentBusinessAction = {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  detail: string;
  statusCode: number;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
const PROD_API_FALLBACK = process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com";

function apiBases(): string[] {
  if (process.env.NODE_ENV === "production") {
    return [API_URL, PROD_API_FALLBACK];
  }

  return [API_URL];
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (const base of apiBases()) {
    try {
      return await fetch(`${base}${path}`, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("API inaccessible");
}

export default function GestionUtilisateursPage() {
  const { apiHeaders, user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    user: { id: string; email: string; fullName: string; role: string; identityLinks?: ManagedUser["identityLinks"] };
    activation: { token?: string; expiresAt?: string; emailError?: string; emailPreview?: string; mode?: "token" | "password" };
    initialPassword?: string;
  } | null>(null);
  const [pendingProvision, setPendingProvision] = useState<{
    email: string;
    fullName: string;
    role: ManagedRole;
    identityLinks?: ManagedUser["identityLinks"];
    initialPassword?: string;
  } | null>(null);
  const [useInitialPassword, setUseInitialPassword] = useState(true);
  const [initialPassword, setInitialPassword] = useState("");
  const [editingPasswordUserId, setEditingPasswordUserId] = useState<string | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [savingPasswordUserId, setSavingPasswordUserId] = useState<string | null>(null);
  const [agentActivityUserId, setAgentActivityUserId] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<ActivityLog[]>([]);
  const [agentBusinessActions, setAgentBusinessActions] = useState<AgentBusinessAction[]>([]);
  const [agentLogsLoading, setAgentLogsLoading] = useState(false);
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
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "done" | "error">("idle"); // utilisé dans la modale provision
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

  function generateStrongPassword(length = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += chars[Math.floor(Math.random() * chars.length)] ?? "A";
    }
    return out;
  }

  function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function readApiErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const payload = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(payload?.message)) {
        return payload.message.join(" | ");
      }
      if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      // ignore
    }

    return fallback;
  }

  function openPasswordEditor(userId: string) {
    setEditingPasswordUserId(userId);
    setPasswordDraft(generateStrongPassword());
  }

  async function saveUserPassword(userId: string) {
    if (passwordDraft.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caracteres");
      return;
    }

    setSavingPasswordUserId(userId);
    setError(null);

    try {
      const res = await fetchApi(`/auth/users/${userId}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({ password: passwordDraft }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `Mise a jour mot de passe impossible (${res.status})`));
      }

      await loadUsers(true);
      setEditingPasswordUserId(null);
      setPasswordDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSavingPasswordUserId(null);
    }
  }

  async function loadUsers(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetchApi("/auth/users", { headers: apiHeaders });
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
          fetchApi("/properties", { headers: apiHeaders }),
          fetchApi("/tenants", { headers: apiHeaders }),
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
    setProvisionResult(null);

    if (!isValidEmail(email)) {
      setError("Email invalide. Exemple attendu: nom@domaine.com");
      return;
    }

    if (!fullName.trim()) {
      setError("Nom complet obligatoire");
      return;
    }

    const selectedInitialPassword = useInitialPassword ? initialPassword : undefined;
    if (selectedInitialPassword && selectedInitialPassword.length < 8) {
      setError("Le mot de passe initial doit contenir au moins 8 caracteres");
      return;
    }

    const identityLinks: Record<string, unknown> =
      role === "proprietaire"
          ? { propertyIds: [buildAutoId("PROP", fullName)] }
          : role === "agent"
            ? {
                agency: `AGENCE-${buildAutoId("AG", fullName)}`,
                agentCode: buildAutoId("AGT", fullName),
              }
            : {};

    setPendingProvision({
      email: email.trim(),
      fullName: fullName.trim(),
      role,
      identityLinks,
      initialPassword: selectedInitialPassword,
    });
  }

  async function confirmProvision() {
    if (!pendingProvision) {
      return;
    }

    try {
      const res = await fetchApi("/auth/users/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({
          email: pendingProvision.email,
          fullName: pendingProvision.fullName,
          role: pendingProvision.role,
          identityLinks: pendingProvision.identityLinks,
          initialPassword: pendingProvision.initialPassword,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `Provisioning impossible (${res.status})`));
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const payload = await res.json();
      setProvisionResult({
        ...payload,
        initialPassword: pendingProvision.initialPassword,
      });
      setPendingProvision(null);
      setEmail("");
      setFullName("");
      setInitialPassword("");
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
      const res = await fetchApi(`/auth/users/${id}/suspend`, {
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
      const res = await fetchApi(`/auth/users/${userId}/role`, {
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
      const res = await fetchApi(`/auth/users/${id}/reactivate`, {
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

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("done");
      setTimeout(() => setCopyFeedback("idle"), 1400);
    } catch {
      setCopyFeedback("error");
      setTimeout(() => setCopyFeedback("idle"), 1400);
    }
  }

  async function viewAgentActivity(agentUser: ManagedUser) {
    setAgentActivityUserId(agentUser.id);
    setAgentLogs([]);
    setAgentBusinessActions([]);
    setAgentLogsLoading(true);
    try {
      const res = await fetchApi(`/activity-logs?actorId=${agentUser.id}&limit=100`, { headers: apiHeaders });
      if (res.ok) {
        const logs = (await res.json()) as ActivityLog[];
        setAgentLogs(logs);
        setAgentBusinessActions(logs.map(toBusinessAction).filter((item): item is AgentBusinessAction => !!item));
      }
    } catch {
      // ignore
    } finally {
      setAgentLogsLoading(false);
    }
  }

  function toBusinessAction(log: ActivityLog): AgentBusinessAction | null {
    const method = log.method.toUpperCase();
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      return null;
    }

    const cleanPath = log.path.split("?")[0] ?? log.path;

    const rules: Array<{ re: RegExp; action: string; module: string; detail?: string }> = [
      { re: /^\/properties$/, action: "Ajout bien", module: "Biens" },
      { re: /^\/properties\/.+$/, action: method === "DELETE" ? "Suppression bien" : "Modification bien", module: "Biens" },
      { re: /^\/tenants$/, action: "Ajout locataire", module: "Locataires" },
      { re: /^\/tenants\/.+$/, action: method === "DELETE" ? "Suppression locataire" : "Modification locataire", module: "Locataires" },
      { re: /^\/payments$/, action: "Enregistrement paiement", module: "Paiements" },
      { re: /^\/payments\/[^/]+\/reminder$/, action: "Envoi rappel paiement", module: "Paiements" },
      { re: /^\/payments\/.+$/, action: method === "DELETE" ? "Suppression paiement" : "Mise a jour paiement", module: "Paiements" },
      { re: /^\/contracts$/, action: "Création contrat", module: "Contrats" },
      { re: /^\/contracts\/.+$/, action: method === "DELETE" ? "Suppression contrat" : "Mise a jour contrat", module: "Contrats" },
      { re: /^\/inspections$/, action: "Planification état des lieux", module: "Etats des lieux" },
      { re: /^\/inspections\/[^/]+\/photos$/, action: "Ajout photo état des lieux", module: "Etats des lieux" },
      { re: /^\/inspections\/[^/]+\/sign$/, action: "Signature état des lieux", module: "Etats des lieux" },
      { re: /^\/inspections\/.+$/, action: method === "DELETE" ? "Suppression état des lieux" : "Mise a jour état des lieux", module: "Etats des lieux" },
      { re: /^\/incidents$/, action: "Création incident", module: "Incidents" },
      { re: /^\/incidents\/.+$/, action: method === "DELETE" ? "Suppression incident" : "Mise a jour incident", module: "Incidents" },
      { re: /^\/auth\/users\/provision$/, action: "Création compte", module: "Utilisateurs" },
      { re: /^\/auth\/users\/[^/]+\/role$/, action: "Modification rôle utilisateur", module: "Utilisateurs" },
      { re: /^\/auth\/users\/[^/]+\/password$/, action: "Modification mot de passe", module: "Utilisateurs" },
      { re: /^\/auth\/users\/[^/]+\/suspend$/, action: "Suspension utilisateur", module: "Utilisateurs" },
      { re: /^\/auth\/users\/[^/]+\/reactivate$/, action: "Réactivation utilisateur", module: "Utilisateurs" },
    ];

    const matched = rules.find((rule) => rule.re.test(cleanPath));
    if (!matched) {
      return null;
    }

    return {
      id: log.id,
      timestamp: log.timestamp,
      action: matched.action,
      module: matched.module,
      detail: cleanPath,
      statusCode: log.statusCode,
    };
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
      const res = await fetchApi(`/auth/users/${item.id}/role`, {
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
    if (identityLinks.agentCode) chunks.push(`Identifiant agent: ${identityLinks.agentCode}`);

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
          <label className="md:col-span-3 inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={useInitialPassword}
              onChange={(e) => {
                const enabled = e.target.checked;
                setUseInitialPassword(enabled);
                if (enabled && !initialPassword) {
                  setInitialPassword(generateStrongPassword());
                }
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            Définir un mot de passe initial (compte actif immédiatement)
          </label>
          {useInitialPassword && (
            <>
              <input
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                minLength={8}
                placeholder="Mot de passe initial (8+ caractères)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              />
              <button
                type="button"
                onClick={() => setInitialPassword(generateStrongPassword())}
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Générer mot de passe
              </button>
            </>
          )}
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 md:col-span-2">
            Les identifiants metier (agence et identifiant agent) sont generes automatiquement.
          </p>
          <button type="submit" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Provisionner</button>
        </form>
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
                          {canAdmin && user.role === "agent" && (
                            <button
                              type="button"
                              onClick={() => void viewAgentActivity(user)}
                              className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                            >
                              Voir activit&eacute;s
                            </button>
                          )}
                          {canAdmin && user.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => openPasswordEditor(user.id)}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                            >
                              Mot de passe
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

      {pendingProvision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Validation admin avant création</h2>
            <p className="mt-1 text-xs text-slate-500">Vérifiez les données ci-dessous puis confirmez la création.</p>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <p>Nom: <strong>{pendingProvision.fullName}</strong></p>
              <p>Email: <strong>{pendingProvision.email}</strong></p>
              <p>Rôle: <strong>{pendingProvision.role}</strong></p>
              {pendingProvision.identityLinks?.agency && <p>Agence: <strong>{pendingProvision.identityLinks.agency}</strong></p>}
              {pendingProvision.identityLinks?.agentCode && <p>Identifiant agent: <strong>{pendingProvision.identityLinks.agentCode}</strong></p>}
              {pendingProvision.initialPassword && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-800">Mot de passe initial (modifiable):</p>
                  <p className="mt-1 break-all font-mono text-xs text-amber-900">{pendingProvision.initialPassword}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingProvision(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmProvision()}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Valider et créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale: IDs agent après provisionnement ─────────────────── */}
      {provisionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                <span className="text-lg">✓</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Compte créé avec succès</h2>
                <p className="text-xs text-slate-500">
                  {provisionResult.activation.mode === "password"
                    ? "Compte actif immédiatement avec mot de passe défini par l'admin"
                    : "Transmettez ces identifiants à l&apos;agent pour activation"}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nom complet</span>
                <span className="font-semibold text-slate-900">{provisionResult.user.fullName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-mono text-xs text-slate-700">{provisionResult.user.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Rôle</span>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-700 capitalize">{provisionResult.user.role}</span>
              </div>
              {provisionResult.user.identityLinks?.agency && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Agence</span>
                  <span className="font-mono text-xs font-semibold text-slate-900">{provisionResult.user.identityLinks.agency}</span>
                </div>
              )}
              {provisionResult.user.identityLinks?.agentCode && (
                <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
                  <span className="font-semibold text-indigo-700">Identifiant agent</span>
                  <span className="font-mono text-sm font-bold text-indigo-900">{provisionResult.user.identityLinks.agentCode}</span>
                </div>
              )}
              {provisionResult.user.identityLinks?.propertyIds?.length && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500">Biens</span>
                  <span className="text-right font-mono text-xs text-slate-700">{provisionResult.user.identityLinks.propertyIds.join(", ")}</span>
                </div>
              )}
            </div>

            {provisionResult.initialPassword && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-emerald-800">Mot de passe initial</p>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(provisionResult.initialPassword ?? "")}
                    className="rounded border border-emerald-300 bg-white/80 px-2 py-0.5 text-xs font-semibold text-emerald-900 hover:bg-white"
                  >
                    {copyFeedback === "done" ? "Copié ✓" : copyFeedback === "error" ? "Echec" : "Copier"}
                  </button>
                </div>
                <p className="mt-2 break-all rounded bg-white/60 px-2 py-1 font-mono text-xs text-emerald-900">{provisionResult.initialPassword}</p>
              </div>
            )}

            {provisionResult.activation.token && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-amber-800">
                    Token d&apos;activation &nbsp;
                    {provisionResult.activation.emailError
                      ? <span className="text-red-600">⚠ email non envoyé</span>
                      : <span className="text-green-700">✓ email envoyé</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(provisionResult.activation.token ?? "")}
                    className="rounded border border-amber-300 bg-white/80 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-white"
                  >
                    {copyFeedback === "done" ? "Copié ✓" : copyFeedback === "error" ? "Echec" : "Copier"}
                  </button>
                </div>
                {provisionResult.activation.emailError && (
                  <p className="mt-1 text-xs text-red-600">{provisionResult.activation.emailError} — Partagez le token manuellement.</p>
                )}
                <p className="mt-2 break-all rounded bg-white/60 px-2 py-1 font-mono text-xs text-amber-900">{provisionResult.activation.token}</p>
              </div>
            )}

            {!provisionResult.initialPassword && provisionResult.activation.token && (
              <p className="mt-3 text-xs text-slate-400">
                L&apos;agent doit utiliser ce token sur la page <strong>/auth/activate</strong> pour définir son mot de passe et se connecter.
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setProvisionResult(null)}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Valider et fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPasswordUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Modifier le mot de passe</h2>
            <p className="mt-1 text-xs text-slate-500">Ce changement est immédiat et active le compte.</p>

            <input
              value={passwordDraft}
              onChange={(event) => setPasswordDraft(event.target.value)}
              placeholder="Nouveau mot de passe (8+ caractères)"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPasswordDraft(generateStrongPassword())}
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Générer
              </button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPasswordUserId(null);
                  setPasswordDraft("");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={savingPasswordUserId === editingPasswordUserId}
                onClick={() => void saveUserPassword(editingPasswordUserId)}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                {savingPasswordUserId === editingPasswordUserId ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale: Activités d'un agent ────────────────────────────── */}
      {agentActivityUserId && (() => {
        const agentUser = users.find((u) => u.id === agentActivityUserId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-4 flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" style={{ maxHeight: "85vh" }}>
              <div className="flex items-center justify-between border-b border-slate-200 p-5">
                <div>
                  <h2 className="font-bold text-slate-900">Activités de l&apos;agent</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="font-semibold">{agentUser?.fullName}</span> — {agentUser?.email}
                    {agentUser?.identityLinks?.agency && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{agentUser.identityLinks.agency}</span>}
                    {agentUser?.identityLinks?.agentCode && <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs text-indigo-700">{agentUser.identityLinks.agentCode}</span>}
                  </p>
                </div>
                <button
                  onClick={() => setAgentActivityUserId(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Fermer
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {agentLogsLoading ? (
                  <p className="py-12 text-center text-sm text-slate-500">Chargement des activités...</p>
                ) : agentBusinessActions.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">Aucune action métier trouvée pour cet agent</p>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2 pr-4 text-left font-semibold text-slate-500">Action</th>
                        <th className="py-2 pr-4 text-left font-semibold text-slate-500">Module</th>
                        <th className="py-2 pr-4 text-left font-semibold text-slate-500">Détail</th>
                        <th className="py-2 pr-4 text-left font-semibold text-slate-500">Date / Heure</th>
                        <th className="py-2 pr-4 text-left font-semibold text-slate-500">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agentBusinessActions.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2 pr-4 font-semibold text-slate-700">{log.action}</td>
                          <td className="py-2 pr-4 text-slate-600">{log.module}</td>
                          <td className="py-2 pr-4 font-mono text-slate-600">{log.detail}</td>
                          <td className="py-2 pr-4 text-slate-600">{new Date(log.timestamp).toLocaleString("fr-FR")}</td>
                          <td className="py-2 pr-4">
                            <span className={`rounded px-1.5 py-0.5 font-bold ${
                              log.statusCode < 300 ? "bg-green-50 text-green-700"
                              : log.statusCode < 500 ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                            }`}>{log.statusCode}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
                {agentBusinessActions.length > 0 && `${agentBusinessActions.length} action(s) métier — 100 dernières requêtes analysées`}
              </div>
            </div>
          </div>
        );
      })()}

    </main>
  );
}
