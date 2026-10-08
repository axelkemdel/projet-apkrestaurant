import type { RequestHandler } from "express";
import type { Role } from "@prisma/client";
import { HttpError } from "../lib/errors.js";
import { authenticateJWT } from "./authenticateJWT.js";
import { auditEvent } from "./auditLogger.js";

/**
 * Contrôle d'accès par rôle (RBAC), après `authenticateJWT`. Sans rôle précisé : tout
 * utilisateur connecté. Le gérant (ADMIN) a accès à tout. Chaque refus est journalisé
 * (un employé qui tente d'ouvrir une route d'un autre rôle est un signal à surveiller).
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, "auth.required");
    if (roles.length && req.user.role !== "ADMIN" && !roles.includes(req.user.role)) {
      void auditEvent(req, "ACCESS_DENIED", { method: req.method, path: req.originalUrl.slice(0, 120), role: req.user.role, required: roles });
      throw new HttpError(403, "auth.forbiddenRole");
    }
    next();
  };
}

/** Raccourci : authentification par jeton d'accès + contrôle de rôle. */
export function requireAuth(...roles: Role[]): RequestHandler[] {
  return [authenticateJWT, requireRole(...roles)];
}
