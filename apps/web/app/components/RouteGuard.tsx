"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/auth";
import { useResilience } from "../context/resilience";
import { getDefaultRouteForRole, isRouteAllowed } from "../lib/rbac";
import LoadingVideo from "./LoadingVideo";

const PUBLIC_ROUTES = new Set(["/login", "/acces-refuse"]);

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { isOnline } = useResilience();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (!isLoading && !user && !isPublicRoute && isOnline) {
      router.replace("/login");
    }

    if (!isLoading && user && !isPublicRoute && !isRouteAllowed(pathname, user.role)) {
      router.replace("/acces-refuse");
    }

    if (!isLoading && user && pathname === "/login") {
      router.replace(getDefaultRouteForRole(user.role));
    }
  }, [isLoading, user, isPublicRoute, pathname, router, isOnline]);

  if (isLoading) {
    return (
      <div className="px-4 py-10">
        <LoadingVideo label="Chargement session..." size="lg" />
      </div>
    );
  }

  if (!user && !isPublicRoute) {
    if (!isOnline) {
      return <div className="px-4 py-10 text-center text-sm text-slate-500">Hors ligne: connexion impossible pour le moment. Reessayez des que le reseau revient.</div>;
    }
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Redirection vers la connexion...</div>;
  }

  if (user && !isPublicRoute && !isRouteAllowed(pathname, user.role)) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Accès refusé pour ce rôle. Redirection...</div>;
  }

  return <>{children}</>;
}
