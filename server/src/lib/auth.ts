import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env.js";
import { HttpError } from "./errors.js";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  // Durée d'un service (une journée de travail)
  return jwt.sign(user, env.jwtSecret, { expiresIn: "14h" });
}

export function verifyToken(token: string): AuthUser {
  const { id, name, role } = jwt.verify(token, env.jwtSecret) as AuthUser;
  return { id, name, role };
}

/** Exige un utilisateur connecté ; si des rôles sont donnés, l'utilisateur doit en avoir un (ADMIN passe toujours). */
export function requireAuth(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentification requise");
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      throw new HttpError(401, "Session expirée, reconnectez-vous");
    }
    if (roles.length && req.user.role !== "ADMIN" && !roles.includes(req.user.role)) {
      throw new HttpError(403, "Accès refusé pour ce rôle");
    }
    next();
  };
}
