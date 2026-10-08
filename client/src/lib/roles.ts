import type { Role } from "../types";

/** Écran d'accueil de chaque rôle (redirection automatique après connexion). */
export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin/dashboard",
  SERVEUR: "/pos/tables",
  CUISINE: "/kds/kitchen",
  CAISSE: "/cashier/checkout",
};

/** Rôles autorisés par écran (le gérant a accès à tout) — miroir des contrôles de l'API. */
export const ROUTE_ROLES = {
  pos: ["SERVEUR", "CAISSE"],
  kds: ["CUISINE"],
  cashier: ["CAISSE"],
  admin: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export const canAccess = (role: Role, allowed: readonly Role[]) => role === "ADMIN" || allowed.includes(role);
