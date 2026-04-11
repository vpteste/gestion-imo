"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/auth";

type IncidentStatus = "ouvert" | "en_cours" | "resolu";

type Incident = {
  id: string;
  propertyId: string;
  propertyReference?: string;
  tenantId: string;
  tenantEmail?: string;
  title: string;
  description: string;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function IncidentsPage() {
  const { user, apiHeaders } = useAuth();
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/incidents`, { headers: apiHeaders });
      if (!res.ok) {
        throw new Error(`Erreur incidents (${res.status})`);
      }

      const data = (await res.json()) as Incident[];
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiHeaders]);

  async function createIncident(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      const res = await fetch(`${API_URL}/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({ title, description }),
      });

      if (!res.ok) {
        throw new Error(`Création impossible (${res.status})`);
      }

      setShowCreateForm(false);
      setTitle("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function updateStatus(id: string, status: IncidentStatus) {
    setError(null);

    try {
      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error(`Mise à jour impossible (${res.status})`);
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function startEdit(item: Incident) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
  }

  async function saveEdit(id: string) {
    setError(null);

    try {
      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...apiHeaders,
        },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });

      if (!res.ok) {
        throw new Error(`Modification impossible (${res.status})`);
      }

      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function deleteIncident(id: string) {
    const confirmed = window.confirm("Supprimer cet incident ?");
    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/incidents/${id}`, {
        method: "DELETE",
        headers: apiHeaders,
      });

      if (!res.ok) {
        throw new Error(`Suppression impossible (${res.status})`);
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  const canManage = user?.role === "admin" || user?.role === "agent" || user?.role === "proprietaire";

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Incidents</h1>
              <p className="mt-1 text-sm text-slate-500">Signalements et suivi opérationnel.</p>
              <p className="mt-1 text-xs text-slate-500">Cadre legal applique: lois de la Republique de Cote d'Ivoire.</p>
            </div>
            {user?.role === "locataire" && (
              <button
                onClick={() => setShowCreateForm((prev) => !prev)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {showCreateForm ? "Fermer le formulaire" : "+ Nouveau signalement"}
              </button>
            )}
          </div>
        </header>

        {user?.role === "locataire" && showCreateForm && (
          <form onSubmit={createIncident} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Signaler
            </button>
          </form>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

        <section className="grid grid-cols-1 gap-4">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Chargement...</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Aucun incident</p>
          ) : (
            items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-800">{item.title}</h2>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.propertyReference ?? item.propertyId}</span>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.status}</span>
                </div>

                {editingId === item.id ? (
                  <div className="mt-2 space-y-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void saveEdit(item.id)} className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Enregistrer</button>
                      <button onClick={() => setEditingId(null)} className="rounded border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("fr-FR")}</p>

                {canManage && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => updateStatus(item.id, "en_cours")} className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">En cours</button>
                    <button onClick={() => updateStatus(item.id, "resolu")} className="rounded border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Résolu</button>
                    <button onClick={() => startEdit(item)} className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Modifier</button>
                    <button onClick={() => void deleteIncident(item.id)} className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Supprimer</button>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
