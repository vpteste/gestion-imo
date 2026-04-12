"use client";

import { useResilience } from "../context/resilience";

export default function ResilienceBanner() {
  const { isOnline, apiReachable, isDegraded, lastCheckedAt, checkNow } = useResilience();

  if (!isDegraded) {
    return null;
  }

  const message = !isOnline
    ? "Connexion internet indisponible. Mode degrade actif."
    : "API momentanement inaccessible. Vos actions peuvent echouer temporairement.";

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
        <span className="font-semibold">Alerte fiabilite</span>
        <span className="text-amber-800">{message}</span>
        <button
          onClick={() => void checkNow()}
          className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
        >
          Reessayer
        </button>
        {lastCheckedAt && (
          <span className="ml-auto text-[11px] text-amber-700">
            Derniere verification: {new Date(lastCheckedAt).toLocaleTimeString("fr-FR")}
          </span>
        )}
      </div>
    </div>
  );
}
