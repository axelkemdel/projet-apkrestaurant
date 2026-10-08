import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { canAccess, HOME_BY_ROLE } from "../lib/roles";
import type { Role } from "../types";

/**
 * Garde de route (RBAC côté écran) : sans session → connexion ; rôle non autorisé →
 * écran d'accueil de son rôle. Ce n'est qu'un confort d'interface : chaque appel
 * à l'API est de toute façon revérifié par le serveur (`requireRole`).
 */
export function ProtectedRoute({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!canAccess(user.role, roles)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children;
}
