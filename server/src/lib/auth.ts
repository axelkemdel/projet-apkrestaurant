import type { Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env.js";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import type { Actor } from "./audit.js";

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

/**
 * Session = JWT signé dans un cookie HttpOnly (illisible par JavaScript, donc
 * hors de portée d'un XSS), SameSite=Strict (jamais envoyé depuis un autre site)
 * et Secure (HTTPS uniquement, voir COOKIE_SECURE).
 *
 * Deux limites de durée :
 *  - absolue : 14 h (un service), fixée à la connexion ;
 *  - inactivité : SESSION_IDLE_MINUTES sans requête → session expirée. Le jeton
 *    est ré-émis (glissant) au plus une fois par minute tant que l'appareil est
 *    utilisé. Les écrans cuisine (KDS, affichage permanent) n'ont que la limite absolue.
 */
export const SESSION_COOKIE = "restoapp_session";
const ABSOLUTE_MS = 14 * 3_600_000;
const REFRESH_AFTER_MS = 60_000;

interface SessionClaims {
  id: string;
  sv: number; // version de session (révocation)
  abs: number; // début de session (ms) pour la limite absolue
  iat?: number;
}

function sign(claims: Omit<SessionClaims, "iat">) {
  return jwt.sign({ ...claims, exp: Math.floor((claims.abs + ABSOLUTE_MS) / 1000) }, env.jwtSecret, { algorithm: "HS256" });
}

function setCookie(res: Response, token: string, abs: number) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.cookieSecure,
    path: "/",
    maxAge: Math.max(0, abs + ABSOLUTE_MS - Date.now()),
  });
}

export function startSession(res: Response, user: { id: string; sessionVersion: number }) {
  const abs = Date.now();
  setCookie(res, sign({ id: user.id, sv: user.sessionVersion, abs }), abs);
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "strict", secure: env.cookieSecure, path: "/" });
}

/**
 * Vérifie la signature du jeton, l'inactivité, PUIS l'état actuel du compte en base :
 * un employé désactivé, dont le PIN ou le rôle a changé, perd immédiatement l'accès.
 */
export async function authenticate(token: string | undefined): Promise<{ user: AuthUser; claims: SessionClaims }> {
  if (!token) throw new HttpError(401, "auth.required");
  let claims: SessionClaims;
  try {
    claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as SessionClaims;
  } catch {
    throw new HttpError(401, "auth.expired");
  }
  const user = await prisma.user.findUnique({
    where: { id: claims.id },
    select: { id: true, name: true, role: true, isActive: true, sessionVersion: true },
  });
  if (!user || !user.isActive || user.sessionVersion !== claims.sv) {
    throw new HttpError(401, "auth.expired");
  }
  const idleMs = Date.now() - (claims.iat ?? 0) * 1000;
  if (user.role !== "CUISINE" && idleMs > env.sessionIdleMinutes * 60_000) {
    throw new HttpError(401, "auth.idleExpired");
  }
  return { user: { id: user.id, name: user.name, role: user.role }, claims };
}

/** Exige un utilisateur connecté ; si des rôles sont donnés, l'utilisateur doit en avoir un (ADMIN passe toujours). */
export function requireAuth(...roles: Role[]): RequestHandler {
  return async (req, res, next) => {
    const { user, claims } = await authenticate(req.cookies?.[SESSION_COOKIE]);
    req.user = user;
    // Session glissante : ré-émission au plus une fois par minute
    if (Date.now() - (claims.iat ?? 0) * 1000 > REFRESH_AFTER_MS) {
      setCookie(res, sign({ id: claims.id, sv: claims.sv, abs: claims.abs }), claims.abs);
    }
    if (roles.length && user.role !== "ADMIN" && !roles.includes(user.role)) {
      throw new HttpError(403, "auth.forbiddenRole");
    }
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw new HttpError(401, "auth.required");
  return { ...req.user, ip: req.ip ?? null };
}
