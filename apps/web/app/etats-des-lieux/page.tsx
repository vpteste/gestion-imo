"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/auth";
import LoadingVideo from "../components/LoadingVideo";

type InspectionType = "entree" | "sortie";
type InspectionStatus = "planifie" | "realise" | "valide";

type InspectionPhoto = {
  filename: string;
  url: string;
  uploadedAt: string;
};

type Inspection = {
  id: string;
  propertyId: string;
  leaseId: string;
  type: InspectionType;
  status: InspectionStatus;
  notes?: string;
  entreeNotes?: string;
  sortieNotes?: string;
  entreePhotos: InspectionPhoto[];
  sortiePhotos: InspectionPhoto[];
  scheduledAt: string;
  signedByTenantAt?: string;
  signedByTenantName?: string;
  signedByTenantSignatureDataUrl?: string;
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
  rentAmount: number;
};

type InspectionTarget = {
  id: string;
  fullName: string;
  email: string;
  propertyId?: string;
  propertyReference?: string;
  leaseId?: string;
  leaseReference?: string;
};

const API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
const PROD_API_FALLBACK = process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com";
const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gestion-imo-api.onrender.com";

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

function resolveMediaUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${MEDIA_BASE_URL}${path}`;
}

const STATUS_LABELS: Record<InspectionStatus, string> = {
  planifie: "Planifié",
  realise: "Réalisé",
  valide: "Validé",
};

const STATUS_COLORS: Record<InspectionStatus, string> = {
  planifie: "bg-amber-50 text-amber-700 border-amber-200",
  realise: "bg-blue-50 text-blue-700 border-blue-200",
  valide: "bg-green-50 text-green-700 border-green-200",
};

export default function EtatsDesLieuxPage() {
  const { user, apiHeaders } = useAuth();
  const [items, setItems] = useState<Inspection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Formulaire création
  const [type, setType] = useState<InspectionType>("entree");
  const [scheduledAt, setScheduledAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [entreeNotes, setEntreeNotes] = useState("");
  const [sortieNotes, setSortieNotes] = useState("");
  const [targets, setTargets] = useState<InspectionTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [propertyRentByKey, setPropertyRentByKey] = useState<Record<string, number>>({});
  const [propertyLabelById, setPropertyLabelById] = useState<Record<string, string>>({});
  const [leaseReferenceById, setLeaseReferenceById] = useState<Record<string, string>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Upload photos
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPhase, setUploadPhase] = useState<InspectionType>("entree");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [signingInspectionId, setSigningInspectionId] = useState<string | null>(null);
  const [tenantSignatureName, setTenantSignatureName] = useState("");
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editEntreeNotes, setEditEntreeNotes] = useState("");
  const [editSortieNotes, setEditSortieNotes] = useState("");
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signatureDrawingRef = useRef(false);

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

  async function loadTargets() {
    if (!(user?.role === "admin" || user?.role === "agent")) return;
    try {
      const res = await fetchApi("/tenants", { headers: apiHeaders });
      if (!res.ok) return;
      const tenants = (await res.json()) as Tenant[];
      const mapped = tenants.map((item): InspectionTarget => ({
        id: item.id,
        fullName: `${item.firstName} ${item.lastName}`.trim(),
        email: item.email,
        propertyId: item.currentPropertyId,
        propertyReference: item.currentPropertyReference,
        leaseId: item.leaseId,
        leaseReference: item.leaseReference,
      }));
      setTargets(mapped);

      const leaseMap: Record<string, string> = {};
      for (const item of mapped) {
        if (item.leaseId && item.leaseReference) {
          leaseMap[item.leaseId] = item.leaseReference;
        }
      }
      setLeaseReferenceById(leaseMap);

      if (!selectedTargetId && mapped.length > 0) {
        setSelectedTargetId(mapped[0].id);
      }
    } catch {
      // ignore
    }
  }

  async function loadPropertiesForRent() {
    try {
      const res = await fetchApi("/properties", { headers: apiHeaders });
      if (!res.ok) return;
      const properties = (await res.json()) as Property[];
      const rentMap: Record<string, number> = {};
      const labelMap: Record<string, string> = {};
      for (const item of properties) {
        rentMap[item.id] = item.rentAmount;
        rentMap[item.reference] = item.rentAmount;
        labelMap[item.id] = `${item.reference} - ${item.title}`;
      }
      setPropertyRentByKey(rentMap);
      setPropertyLabelById(labelMap);
    } catch {
      // ignore
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi("/inspections", { headers: apiHeaders });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `Erreur etats des lieux (${res.status})`));
      }
      setItems((await res.json()) as Inspection[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([load(), loadTargets(), loadPropertiesForRent()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiHeaders]);

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
      setSelectedTargetId(filteredTargets[0].id);
    }
  }, [filteredTargets, selectedTargetId]);

  async function createInspection(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const target = filteredTargets.find((item) => item.id === selectedTargetId);
    if (!target) {
      setError("Selectionne un locataire cible.");
      return;
    }
    if (!target.propertyId || !target.leaseId) {
      setError("Le locataire cible doit avoir un bien et un bail actifs.");
      return;
    }

    try {
      const res = await fetchApi("/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          propertyId: target.propertyId,
          leaseId: target.leaseId,
          type,
          scheduledAt: new Date(scheduledAt).toISOString(),
          notes,
          entreeNotes,
          sortieNotes,
        }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, `Creation impossible (${res.status})`));
      setShowCreateForm(false);
      setNotes(""); setEntreeNotes(""); setSortieNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function updateStatus(id: string, status: InspectionStatus) {
    setError(null);
    try {
      const res = await fetchApi(`/inspections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, `Mise a jour impossible (${res.status})`));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function openSignPad(inspection: Inspection) {
    setSigningInspectionId(inspection.id);
    setTenantSignatureName(user?.fullName ?? "");

    requestAnimationFrame(() => {
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      const width = Math.min(window.innerWidth - 56, 460);
      const height = 180;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    });
  }

  function clearSignPad() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function getCanvasPos(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function onSignPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(event);
    signatureDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function onSignPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!signatureDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getCanvasPos(event);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function onSignPointerUp() {
    signatureDrawingRef.current = false;
  }

  async function submitSignature() {
    if (!signingInspectionId) {
      return;
    }

    const canvas = signatureCanvasRef.current;
    if (!canvas) {
      setError("Zone de signature indisponible.");
      return;
    }

    const signatureDataUrl = canvas.toDataURL("image/png");
    const emptyCanvas = document.createElement("canvas");
    emptyCanvas.width = canvas.width;
    emptyCanvas.height = canvas.height;
    const emptyDataUrl = emptyCanvas.toDataURL("image/png");

    if (signatureDataUrl === emptyDataUrl) {
      setError("Veuillez signer dans la zone avant validation.");
      return;
    }

    setError(null);
    try {
      const res = await fetchApi(`/inspections/${signingInspectionId}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({
          tenantName: tenantSignatureName,
          signatureDataUrl,
        }),
      });

      if (!res.ok) throw new Error(await readApiErrorMessage(res, `Signature impossible (${res.status})`));

      setSigningInspectionId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function deleteInspection(id: string) {
    const confirmed = window.confirm("Supprimer cet état des lieux ?");
    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      const res = await fetchApi(`/inspections/${id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `Suppression impossible (${res.status})`));
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function openUploadDialog(inspectionId: string, phase: InspectionType) {
    setUploadingId(inspectionId);
    setUploadPhase(phase);
    setPhotoPreview(null);
    fileInputRef.current?.click();
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !uploadingId) return;
    setPhotoPreview(URL.createObjectURL(file));
    void uploadPhoto(uploadingId, uploadPhase, file);
    // reset input pour permettre ré-upload même fichier
    event.target.value = "";
  }

  async function uploadPhoto(id: string, phase: InspectionType, file: File) {
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("phase", phase);
      const res = await fetchApi(`/inspections/${id}/photos`, {
        method: "POST",
        headers: apiHeaders, // pas de Content-Type: multipart auto
        body: form,
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, `Upload impossible (${res.status})`));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPhotoPreview(null);
      setUploadingId(null);
    }
  }

  function openEditInspection(item: Inspection) {
    setEditingInspectionId(item.id);
    setEditScheduledAt(item.scheduledAt.slice(0, 16));
    setEditNotes(item.notes ?? "");
    setEditEntreeNotes(item.entreeNotes ?? "");
    setEditSortieNotes(item.sortieNotes ?? "");
  }

  async function saveInspectionEdits() {
    if (!editingInspectionId) {
      return;
    }

    setError(null);
    try {
      const res = await fetchApi(`/inspections/${editingInspectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          scheduledAt: new Date(editScheduledAt).toISOString(),
          notes: editNotes,
          entreeNotes: editEntreeNotes,
          sortieNotes: editSortieNotes,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, `Mise a jour impossible (${res.status})`));
      }

      setEditingInspectionId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  const canCreate = user?.role === "admin" || user?.role === "agent";
  const canManage = user?.role === "admin" || user?.role === "agent" || user?.role === "proprietaire";
  const canSign = user?.role === "locataire" || user?.role === "admin" || user?.role === "agent" || user?.role === "proprietaire";
  const canUpload = user?.role === "admin" || user?.role === "agent";
  const groupedByProperty = items.reduce<Record<string, Inspection[]>>((acc, inspection) => {
    const key = inspection.propertyId || "unknown-property";
    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(inspection);
    return acc;
  }, {});
  const propertyGroups = Object.entries(groupedByProperty).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          role="button"
          tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Photo état des lieux" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
          <button className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/40" onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}

      {/* Input file caché */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onFileSelected}
      />

      {editingInspectionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Modifier planification et notes</h2>
            <p className="mt-1 text-xs text-slate-500">Ajustez la date planifiée et les observations.</p>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notes générales"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <textarea
                  value={editEntreeNotes}
                  onChange={(e) => setEditEntreeNotes(e.target.value)}
                  placeholder="Notes d'entrée"
                  rows={3}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <textarea
                  value={editSortieNotes}
                  onChange={(e) => setEditSortieNotes(e.target.value)}
                  placeholder="Notes de sortie"
                  rows={3}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingInspectionId(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void saveInspectionEdits()}
                className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">États des lieux</h1>
              <p className="mt-1 text-sm text-slate-500">Planification, photos, notes et signature locataire.</p>
              <p className="mt-1 text-xs text-slate-500">Juridiction et clauses: droit immobilier de la Republique de Cote d'Ivoire.</p>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouvel état des lieux"}
              </button>
            )}
          </div>
        </header>

        {/* Formulaire création */}
        {canCreate && showCreateForm && (
          <form onSubmit={createInspection} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">Nouvel état des lieux</h2>
            <input
              value={targetSearch}
              onChange={(e) => setTargetSearch(e.target.value)}
              placeholder="Rechercher locataire (nom, email, bien)..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select value={selectedTargetId} onChange={(e) => setSelectedTargetId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {filteredTargets.length === 0 ? (
                <option value="">Aucun locataire trouvé</option>
              ) : (
                filteredTargets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName} - {item.email}
                  </option>
                ))
              )}
            </select>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p>Bien: {filteredTargets.find((item) => item.id === selectedTargetId)?.propertyReference ?? filteredTargets.find((item) => item.id === selectedTargetId)?.propertyId ?? "non renseigné"}</p>
              <p>Bail: {filteredTargets.find((item) => item.id === selectedTargetId)?.leaseReference ?? filteredTargets.find((item) => item.id === selectedTargetId)?.leaseId ?? "non renseigné"}</p>
              <p>Loyer de référence: {(() => {
                const current = filteredTargets.find((item) => item.id === selectedTargetId);
                const rent = current?.propertyId ? propertyRentByKey[current.propertyId] : undefined;
                return rent != null ? `${rent.toLocaleString("fr-FR")} FCFA` : "non disponible";
              })()}</p>
              {(() => {
                const current = filteredTargets.find((item) => item.id === selectedTargetId);
                if (!current || current.leaseId) return null;
                return (
                  <p className="mt-2">
                    <Link
                      href={`/locataires?search=${encodeURIComponent(current.email)}`}
                      className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Associer un bail depuis Locataires
                    </Link>
                  </p>
                );
              })()}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <select value={type} onChange={(e) => setType(e.target.value as InspectionType)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="entree">Entrée</option>
                <option value="sortie">Sortie</option>
              </select>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Créer</button>
            </div>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes générales" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <textarea value={entreeNotes} onChange={(e) => setEntreeNotes(e.target.value)} placeholder="Notes d'entrée (observations à l'entrée du locataire)" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <textarea value={sortieNotes} onChange={(e) => setSortieNotes(e.target.value)} placeholder="Notes de sortie (observations à la sortie)" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </form>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        {/* Mini aperçu upload en cours */}
        {photoPreview && (
          <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="aperçu" className="h-12 w-12 rounded object-cover" />
            <span className="text-sm text-indigo-700">Téléversement en coursâ€¦</span>
          </div>
        )}

        {canSign && signingInspectionId && (
          <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-blue-700">Signer l'état des lieux</h2>
            <p className="mt-1 text-xs text-slate-500">Signez avec votre doigt sur smartphone ou avec la souris.</p>

            <label className="mt-3 block text-xs font-medium text-slate-700">
              Nom du signataire
              <input
                value={tenantSignatureName}
                onChange={(e) => setTenantSignatureName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-300 bg-slate-50 p-2">
              <canvas
                ref={signatureCanvasRef}
                className="touch-none rounded bg-white"
                onPointerDown={onSignPointerDown}
                onPointerMove={onSignPointerMove}
                onPointerUp={onSignPointerUp}
                onPointerLeave={onSignPointerUp}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => clearSignPad()}
                className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Effacer
              </button>
              <button
                onClick={() => void submitSignature()}
                className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                Valider la signature
              </button>
              <button
                onClick={() => setSigningInspectionId(null)}
                className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
              >
                Annuler
              </button>
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-5">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <LoadingVideo label="Chargement..." size="lg" />
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Aucun état des lieux</p>
          ) : (
            propertyGroups.map(([propertyId, inspections]) => (
              <section key={propertyId} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">
                    Bien: {propertyLabelById[propertyId] ?? propertyId}
                  </h2>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {inspections.length} état(s) des lieux
                  </span>
                </div>

                {inspections.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-4">
                {/* En-tête */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${item.type === "entree" ? "border-teal-200 bg-teal-50 text-teal-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>
                    {item.type === "entree" ? "Entrée" : "Sortie"}
                  </span>
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{propertyLabelById[item.propertyId] ?? item.propertyId}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{leaseReferenceById[item.leaseId] ?? item.leaseId}</span>
                  <span className="ml-auto text-xs text-slate-400">Planifié le {new Date(item.scheduledAt).toLocaleString("fr-FR")}</span>
                </div>

                {/* Notes */}
                {(item.notes || item.entreeNotes || item.sortieNotes) && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {item.notes && (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-500 block mb-1 text-xs uppercase tracking-wide">Notes générales</span>
                        {item.notes}
                      </div>
                    )}
                    {item.entreeNotes && (
                      <div className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">
                        <span className="font-semibold text-teal-600 block mb-1 text-xs uppercase tracking-wide">Notes entrée</span>
                        {item.entreeNotes}
                      </div>
                    )}
                    {item.sortieNotes && (
                      <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
                        <span className="font-semibold text-orange-600 block mb-1 text-xs uppercase tracking-wide">Notes sortie</span>
                        {item.sortieNotes}
                      </div>
                    )}
                  </div>
                )}

                {/* Photos entrée */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Photos entrée ({item.entreePhotos.length})</h3>
                    {canUpload && (
                      <button
                        onClick={() => openUploadDialog(item.id, "entree")}
                        className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                      >
                        + Ajouter
                      </button>
                    )}
                  </div>
                  {item.entreePhotos.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune photo d'entrée</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {item.entreePhotos.map((photo) => (
                        <button
                          key={photo.filename}
                          onClick={() => setLightboxUrl(resolveMediaUrl(photo.url))}
                          className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:border-teal-400"
                          title={`Chargé le ${new Date(photo.uploadedAt).toLocaleString("fr-FR")}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt="Photo entrée"
                            className="h-full w-full object-cover group-hover:opacity-90"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                            <span className="hidden group-hover:block text-white text-lg">📷</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Photos sortie */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-600">Photos sortie ({item.sortiePhotos.length})</h3>
                    {canUpload && (
                      <button
                        onClick={() => openUploadDialog(item.id, "sortie")}
                        className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                      >
                        + Ajouter
                      </button>
                    )}
                  </div>
                  {item.sortiePhotos.length === 0 ? (
                    <p className="text-xs text-slate-400">Aucune photo de sortie</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {item.sortiePhotos.map((photo) => (
                        <button
                          key={photo.filename}
                          onClick={() => setLightboxUrl(resolveMediaUrl(photo.url))}
                          className="group relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:border-orange-400"
                          title={`Chargé le ${new Date(photo.uploadedAt).toLocaleString("fr-FR")}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveMediaUrl(photo.url)}
                            alt="Photo sortie"
                            className="h-full w-full object-cover group-hover:opacity-90"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                            <span className="hidden group-hover:block text-white text-lg">📷</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Signature */}
                <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Signature locataire:{" "}
                    {item.signedByTenantAt
                      ? <strong className="text-green-600">{new Date(item.signedByTenantAt).toLocaleString("fr-FR")}</strong>
                      : <em className="text-slate-400">non signé</em>
                    }
                  </span>
                  {item.signedByTenantName && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      Signé par: {item.signedByTenantName}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {canManage && (
                      <>
                        <button onClick={() => openEditInspection(item)} className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Planif/notes</button>
                        <button onClick={() => updateStatus(item.id, "realise")} className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100">Marquer réalisé</button>
                        <button onClick={() => updateStatus(item.id, "valide")} className="rounded border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-100">Valider</button>
                        <button onClick={() => void deleteInspection(item.id)} className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Supprimer</button>
                      </>
                    )}
                    {canSign && (
                      <button onClick={() => openSignPad(item)} className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">Signer</button>
                    )}
                  </div>
                </div>

                {item.signedByTenantSignatureDataUrl && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Signature enregistrée</p>
                    <img
                      src={item.signedByTenantSignatureDataUrl}
                      alt="Signature locataire"
                      className="max-h-32 rounded border border-slate-200 bg-white"
                    />
                  </div>
                )}
                  </article>
                ))}
              </section>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
