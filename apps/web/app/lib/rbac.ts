import type { UserRole } from "@gestion/shared";

const INTERFACE_ROLES: UserRole[] = ["admin", "agent"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  agent: "Agence",
  proprietaire: "Proprietaire",
  locataire: "Locataire",
};

export const ROLE_ROUTE_ACCESS: Record<string, UserRole[]> = {
  "/": INTERFACE_ROLES,
  "/acces-refuse": ["admin", "agent", "proprietaire", "locataire"],
  "/biens": INTERFACE_ROLES,
  "/locataires": INTERFACE_ROLES,
  "/contrats": INTERFACE_ROLES,
  "/paiements": INTERFACE_ROLES,
  "/dashboard": INTERFACE_ROLES,
  "/journaux-activite": ["admin", "agent"],
  "/gestion-utilisateurs": ["admin"],
  "/incidents": INTERFACE_ROLES,
  "/etats-des-lieux": INTERFACE_ROLES,
};

export type NavLinkDef = {
  href: string;
  label: string;
  roles: UserRole[];
};

export const NAV_LINKS: NavLinkDef[] = [
  { href: "/", label: "Accueil", roles: INTERFACE_ROLES },
  { href: "/biens", label: "Biens", roles: INTERFACE_ROLES },
  { href: "/locataires", label: "Locataires", roles: INTERFACE_ROLES },
  { href: "/contrats", label: "Contrats", roles: INTERFACE_ROLES },
  { href: "/paiements", label: "Paiements", roles: INTERFACE_ROLES },
  { href: "/dashboard", label: "Dashboard", roles: INTERFACE_ROLES },
  { href: "/journaux-activite", label: "Journaux", roles: ["admin", "agent"] },
  { href: "/gestion-utilisateurs", label: "Acces", roles: ["admin"] },
  { href: "/incidents", label: "Incidents", roles: INTERFACE_ROLES },
  { href: "/etats-des-lieux", label: "Etats des lieux", roles: INTERFACE_ROLES },
];

export function isRouteAllowed(pathname: string, role: UserRole): boolean {
  const allowed = ROLE_ROUTE_ACCESS[pathname];
  if (!allowed) {
    return true;
  }
  return allowed.includes(role);
}

export function getDefaultRouteForRole(role: UserRole): string {
  if (role === "admin" || role === "agent") {
    return "/dashboard";
  }

  return "/acces-refuse";
}
