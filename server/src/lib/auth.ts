import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env.js";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

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

export function signToken(user: AuthUser, sessionVersion: number): string {
  // Durée d'un service (une journée de travail)
  return jwt.sign({ ...user, sv: sessionVersion }, env.jwtSecret, { expiresIn: "14h" });
}

/**
 * Vérifie la signature du jeton PUIS l'état actuel du compte en base : un
 * employé désactivé, dont le PIN ou le rôle a changé, perd immédiatement l'accès.
 * Nom et rôle sont relus en base (et non pris du jeton).
 */
export async function authenticate(token: string): Promise<AuthUser> {
  let payload: { id?: string; sv?: number };
  try {
    payload = jwt.verify(token, env.jwtSecret) as typeof payload;
  } catch {
    throw new HttpError(401, "Session expirée, reconnectez-vous");
  }
  const user = payload.id
    ? await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, name: true, role: true, isActive: true, sessionVersion: true },
      })
    : null;
  if (!user || !user.isActive || user.sessionVersion !== payload.sv) {
    throw new HttpError(401, "Session expirée, reconnectez-vous");
  }
  return { id: user.id, name: user.name, role: user.role };
}

/** Exige un utilisateur connecté ; si des rôles sont donnés, l'utilisateur doit en avoir un (ADMIN passe toujours). */
export function requireAuth(...roles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Authentification requise");
    req.user = await authenticate(header.slice(7));
    if (roles.length && req.user.role !== "ADMIN" && !roles.includes(req.user.role)) {
      throw new HttpError(403, "Accès refusé pour ce rôle");
    }
    next();
  };
}
