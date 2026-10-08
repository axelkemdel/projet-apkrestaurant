import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env.js";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";
import type { Actor } from "./audit.js";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Session (appareil) de l'utilisateur authentifié */
      sessionId?: string;
    }
  }
}

/**
 * Sessions « Zero-Trust » : deux jetons, jamais lisibles par JavaScript.
 *
 *  - Jeton d'accès : JWT HS256 de 15 min, cookie HttpOnly + SameSite=Strict + Secure,
 *    envoyé à toute l'API et au handshake Socket.io. À CHAQUE requête, la session et
 *    le compte sont revérifiés en base (révocation, désactivation, changement de rôle
 *    ou de PIN effectifs immédiatement, sans attendre l'expiration du jeton).
 *  - Jeton de rafraîchissement : 32 octets aléatoires, cookie HttpOnly limité au
 *    chemin /api/auth. Seule son empreinte SHA-256 est en base ; il change à chaque
 *    rafraîchissement (rotation) et la présentation d'un ancien jeton révoque la
 *    session entière (vol de cookie détecté).
 *
 * Limites : absolue 14 h (un service) ; inactivité SESSION_IDLE_MINUTES côté serveur
 * (les écrans cuisine, affichages permanents, n'ont que la limite absolue). Le
 * verrouillage d'écran du client intervient avant (5 min).
 */
export const ACCESS_COOKIE = "restoapp_at";
export const REFRESH_COOKIE = "restoapp_rt";
const REFRESH_PATH = "/api/auth";
export const ACCESS_TTL_MS = 15 * 60_000;
const ABSOLUTE_MS = 14 * 3_600_000;
/** Deux requêtes simultanées d'un même appareil peuvent présenter l'ancien jeton juste après une rotation. */
const ROTATION_GRACE_MS = 10_000;
/** Dernière activité enregistrée au plus une fois par minute (pas d'écriture à chaque requête). */
const TOUCH_EVERY_MS = 60_000;
const JWT_OPTIONS = { algorithm: "HS256" as const, issuer: "restoapp", audience: "restoapp-api" };

interface AccessClaims {
  sub: string;
  sid: string;
  sv: number;
  typ: "access";
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function sameHash(a: string, b: string | null | undefined) {
  if (!b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const baseCookie = () => ({ httpOnly: true, sameSite: "strict" as const, secure: env.cookieSecure });

function signAccess(user: { id: string; sessionVersion: number }, sessionId: string) {
  const claims: Omit<AccessClaims, "sub"> = { sid: sessionId, sv: user.sessionVersion, typ: "access" };
  return jwt.sign(claims, env.jwtSecret, { ...JWT_OPTIONS, subject: user.id, expiresIn: Math.floor(ACCESS_TTL_MS / 1000) });
}

function setAccessCookie(res: Response, token: string) {
  res.cookie(ACCESS_COOKIE, token, { ...baseCookie(), path: "/", maxAge: ACCESS_TTL_MS });
}

function setRefreshCookie(res: Response, sessionId: string, secret: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, `${sessionId}.${secret}`, {
    ...baseCookie(),
    path: REFRESH_PATH,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_PATH });
}

const userSelect = { id: true, name: true, username: true, role: true, isActive: true, sessionVersion: true } as const;
const toAuthUser = (u: { id: string; name: string; username: string; role: Role }): AuthUser => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role,
});

const isIdle = (role: Role, lastUsedAt: Date) => role !== "CUISINE" && Date.now() - lastUsedAt.getTime() > env.sessionIdleMinutes * 60_000;

export function revokeSession(sessionId: string, reason: string) {
  return prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
}

/** Ferme toutes les sessions d'un employé (PIN réinitialisé, rôle changé, compte désactivé). */
export function revokeUserSessions(db: Pick<typeof prisma, "authSession">, userId: string, reason: string, exceptSessionId?: string) {
  return db.authSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Ouvre une session après une authentification réussie : pose les deux cookies. */
export async function createSession(res: Response, user: { id: string; sessionVersion: number }, meta: { ip: string | null; userAgent?: string }) {
  const secret = randomBytes(32).toString("base64url");
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: sha256(secret),
      expiresAt: new Date(Date.now() + ABSOLUTE_MS),
      ipAddress: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
    },
  });
  setRefreshCookie(res, session.id, secret, session.expiresAt);
  setAccessCookie(res, signAccess(user, session.id));
  return session;
}

/**
 * Vérifie le jeton d'accès PUIS, en base, la session (non révoquée, non expirée, active
 * récemment) et le compte (actif, même version de session).
 */
export async function authenticate(token: string | undefined): Promise<{ user: AuthUser; sessionId: string }> {
  if (!token) throw new HttpError(401, "auth.required");
  let claims: AccessClaims;
  try {
    claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"], issuer: JWT_OPTIONS.issuer, audience: JWT_OPTIONS.audience }) as AccessClaims;
  } catch {
    throw new HttpError(401, "auth.expired");
  }
  if (claims.typ !== "access" || typeof claims.sid !== "string") throw new HttpError(401, "auth.expired");
  const session = await prisma.authSession.findUnique({ where: { id: claims.sid }, include: { user: { select: userSelect } } });
  const { user } = session ?? {};
  if (!session || !user || session.userId !== claims.sub || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, "auth.expired");
  }
  if (!user.isActive || user.sessionVersion !== claims.sv) throw new HttpError(401, "auth.expired");
  if (isIdle(user.role, session.lastUsedAt)) {
    await revokeSession(session.id, "idle");
    throw new HttpError(401, "auth.idleExpired");
  }
  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.authSession.updateMany({ where: { id: session.id, lastUsedAt: session.lastUsedAt }, data: { lastUsedAt: new Date() } });
  }
  return { user: toAuthUser(user), sessionId: session.id };
}

function parseRefreshCookie(value: unknown): { sessionId: string; secret: string } | null {
  if (typeof value !== "string") return null;
  const match = /^([a-z0-9]{20,40})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? { sessionId: match[1], secret: match[2] } : null;
}

export type RefreshOutcome = { user: AuthUser; sessionId: string } | { error: HttpError; reuse?: { userId: string; sessionId: string } };

/**
 * Rafraîchissement : nouveau jeton d'accès et rotation du jeton de rafraîchissement.
 * Un ancien jeton présenté hors de la courte fenêtre de tolérance = réutilisation
 * (cookie volé ou rejoué) : la session est révoquée.
 */
export async function refreshSession(res: Response, cookieValue: unknown): Promise<RefreshOutcome> {
  const fail = (code: "auth.expired" | "auth.idleExpired" | "auth.required" = "auth.expired") => ({ error: new HttpError(401, code) });
  const parsed = parseRefreshCookie(cookieValue);
  if (!parsed) return fail(cookieValue ? "auth.expired" : "auth.required");
  const session = await prisma.authSession.findUnique({ where: { id: parsed.sessionId }, include: { user: { select: userSelect } } });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) return fail();
  if (isIdle(session.user.role, session.lastUsedAt)) {
    await revokeSession(session.id, "idle");
    return fail("auth.idleExpired");
  }

  const presented = sha256(parsed.secret);
  if (sameHash(presented, session.tokenHash)) {
    const secret = randomBytes(32).toString("base64url");
    const now = new Date();
    // Rotation conditionnelle : une seule requête concurrente l'emporte
    const { count } = await prisma.authSession.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: { tokenHash: sha256(secret), previousHash: session.tokenHash, rotatedAt: now, lastUsedAt: now },
    });
    if (count === 1) setRefreshCookie(res, session.id, secret, session.expiresAt);
    setAccessCookie(res, signAccess(session.user, session.id));
    return { user: toAuthUser(session.user), sessionId: session.id };
  }
  const withinGrace = session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS;
  if (withinGrace && sameHash(presented, session.previousHash)) {
    // Requête partie juste avant la rotation : le navigateur a déjà reçu le nouveau cookie
    setAccessCookie(res, signAccess(session.user, session.id));
    return { user: toAuthUser(session.user), sessionId: session.id };
  }
  await revokeSession(session.id, "refresh_token_reuse");
  return { error: new HttpError(401, "auth.expired"), reuse: { userId: session.userId, sessionId: session.id } };
}

/** Session désignée par la requête (cookie de rafraîchissement, sinon jeton d'accès même expiré). */
export function sessionIdOf(req: Request): string | null {
  const fromRefresh = parseRefreshCookie(req.cookies?.[REFRESH_COOKIE]);
  if (fromRefresh) return fromRefresh.sessionId;
  const token = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== "string") return null;
  try {
    const claims = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: JWT_OPTIONS.issuer,
      audience: JWT_OPTIONS.audience,
      ignoreExpiration: true,
    }) as AccessClaims;
    return typeof claims.sid === "string" ? claims.sid : null;
  } catch {
    return null;
  }
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw new HttpError(401, "auth.required");
  return { ...req.user, ip: req.ip ?? null };
}
