"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../context/auth";
import { getDefaultRouteForRole, isRouteAllowed } from "../lib/rbac";

const PUBLIC_ROUTES = new Set(["/login", "/acces-refuse"]);

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (!isLoading && !user && !isPublicRoute) {
      router.replace("/login");
    }

    if (!isLoading && user && !isPublicRoute && !isRouteAllowed(pathname, user.role)) {
      router.replace("/acces-refuse");
    }

    if (!isLoading && user && pathname === "/login") {
      router.replace(getDefaultRouteForRole(user.role));
    }
  }, [isLoading, user, isPublicRoute, pathname, router]);

  if (isLoading) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Chargement session...</div>;
  }

  if (!user && !isPublicRoute) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Redirection vers la connexion...</div>;
  }

  if (user && !isPublicRoute && !isRouteAllowed(pathname, user.role)) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Accès refusé pour ce rôle. Redirection...</div>;
  }

  return <>{children}</>;
}
