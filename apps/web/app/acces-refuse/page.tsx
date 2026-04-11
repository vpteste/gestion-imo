"use client";

import Link from "next/link";
import { useAuth } from "../context/auth";
import { getDefaultRouteForRole } from "../lib/rbac";

export default function AccessDeniedPage() {
  const { user } = useAuth();
  const backHref = user ? getDefaultRouteForRole(user.role) : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Accès refusé</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Ce module n&apos;est pas disponible pour votre rôle</h1>
        <p className="mt-3 text-sm text-slate-600">
          Votre compte ne possède pas les permissions nécessaires pour accéder à cette page.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={backHref} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Revenir à mon espace
          </Link>
          <Link href="/login" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Changer de compte
          </Link>
        </div>
      </div>
    </main>
  );
}
