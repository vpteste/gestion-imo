import type { UserRole } from "@gestion/shared";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  agent: "Agent",
  proprietaire: "Propriétaire",
  locataire: "Locataire",
};

export const ROLE_ROUTE_ACCESS: Record<string, UserRole[]> = {
  "/": ["admin", "agent", "proprietaire", "locataire"],
  "/acces-refuse": ["admin", "agent", "proprietaire", "locataire"],
  "/mon-patrimoine": ["proprietaire"],
  "/biens": ["admin", "agent", "proprietaire"],
  "/locataires": ["admin", "agent", "proprietaire"],
  "/contrats": ["admin", "agent", "proprietaire"],
  "/mon-espace": ["locataire"],
  "/paiements": ["admin", "agent", "proprietaire"],
  "/dashboard": ["admin", "agent", "proprietaire"],
  "/journaux-activite": ["admin"],
  "/gestion-utilisateurs": ["admin"],
  "/incidents": ["admin", "agent", "proprietaire", "locataire"],
  "/etats-des-lieux": ["admin", "agent", "proprietaire", "locataire"],
};

export type NavLinkDef = {
  href: string;
  label: string;
  roles: UserRole[];
};

export const NAV_LINKS: NavLinkDef[] = [
  { href: "/", label: "Accueil", roles: ["admin", "agent", "proprietaire", "locataire"] },
  { href: "/mon-patrimoine", label: "Mon patrimoine", roles: ["proprietaire"] },
  { href: "/biens", label: "Biens", roles: ["admin", "agent", "proprietaire"] },
  { href: "/locataires", label: "Locataires", roles: ["admin", "agent", "proprietaire"] },
  { href: "/contrats", label: "Contrats", roles: ["admin", "agent", "proprietaire"] },
  { href: "/mon-espace", label: "Mon espace", roles: ["locataire"] },
  { href: "/paiements", label: "Paiements", roles: ["admin", "agent", "proprietaire"] },
  { href: "/dashboard", label: "Dashboard", roles: ["admin", "agent", "proprietaire"] },
  { href: "/journaux-activite", label: "Journaux", roles: ["admin"] },
  { href: "/gestion-utilisateurs", label: "Acces", roles: ["admin"] },
  { href: "/incidents", label: "Incidents", roles: ["admin", "agent", "proprietaire", "locataire"] },
  { href: "/etats-des-lieux", label: "Etats des lieux", roles: ["admin", "agent", "proprietaire", "locataire"] },
];

export function isRouteAllowed(pathname: string, role: UserRole): boolean {
  const allowed = ROLE_ROUTE_ACCESS[pathname];
  if (!allowed) {
    return true;
  }
  return allowed.includes(role);
}

export function getDefaultRouteForRole(role: UserRole): string {
  if (role === "locataire") {
    return "/mon-espace";
  }

  if (role === "proprietaire") {
    return "/mon-patrimoine";
  }

  return "/dashboard";
}
