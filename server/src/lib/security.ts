import type { Express, RequestHandler, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { env } from "./env.js";
import { HttpError } from "./errors.js";

/**
 * Origines de la WebView de l'application mobile (Capacitor) quand elle sert l'interface
 * embarquée : Android https://localhost (ou http://localhost), iOS capacitor://localhost.
 * Aucun site web ne peut se présenter avec ces origines.
 */
const NATIVE_APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

/**
 * Origine de confiance connue : CORS_ORIGIN, application mobile, ou ce Codespace (tous ports).
 * En production, seule la liste CORS_ORIGIN fait foi (aucune origine localhost implicite).
 */
export function isTrustedOrigin(origin: string): boolean {
  if (env.corsOrigin.includes(origin)) return true;
  if (env.isProduction) return false;
  return NATIVE_APP_ORIGINS.has(origin) || Boolean(env.codespaceOrigin?.test(origin));
}

/** Origine autorisée : origine de confiance, ou même hôte que le serveur (accès direct / proxy). */
const isLoopback = (address: string | undefined) => !!address && /^(::1|127\.|::ffff:127\.)/.test(address);

/**
 * La connexion vient-elle d'un proxy de confiance ? Proxy local (Vite, Codespaces) toujours ;
 * proxy distant seulement si TRUST_PROXY le déclare (Railway : TRUST_PROXY=1, plateforme
 * dont le conteneur n'est joignable que par son proxy).
 */
export function fromTrustedProxy(remoteAddress: string | undefined) {
  return isLoopback(remoteAddress) || env.trustProxy === true || (typeof env.trustProxy === "number" && env.trustProxy > 0);
}

/** Nombre de proxys dont les adresses ajoutées à X-Forwarded-For sont crues. */
export const proxyHops = () => (typeof env.trustProxy === "number" && env.trustProxy > 0 ? env.trustProxy : 1);

/** X-Forwarded-Host n'est cru que s'il vient d'un proxy de confiance. */
export function forwardedHostOf(remoteAddress: string | undefined, header: string | string[] | undefined) {
  return fromTrustedProxy(remoteAddress) ? header : undefined;
}

export function isAllowedOrigin(origin: string, host: string | undefined, forwardedHost?: string | string[]) {
  if (isTrustedOrigin(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Même hôte que la page servie : accès direct, ou via un proxy qui annonce l'hôte d'origine
  // (Vite / GitHub Codespaces transmettent X-Forwarded-Host)
  const forwarded = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim();
  if (originHost === host || (forwarded && originHost === forwarded)) return true;
  console.warn(`⚠ Origine refusée : ${origin} (ajoutez-la à CORS_ORIGIN dans server/.env si c'est votre interface)`);
  return false;
}

/**
 * Défense CSRF en profondeur (en plus de SameSite=Strict) : toute requête
 * modifiante venant d'un navigateur doit provenir d'une origine autorisée.
 */
const originCheck: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, req.headers.host, forwardedHostOf(req.socket.remoteAddress, req.headers["x-forwarded-host"]))) throw new HttpError(403, "http.originNotAllowed");
  next();
};

export function applySecurity(app: Express) {
  app.set("trust proxy", env.trustProxy);
  app.use(
    helmet({
      // API JSON + images : rien à exécuter, politique la plus stricte
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'"] } },
      // Les images /uploads sont affichées par le front (même site, éventuellement autre port)
      crossOriginResourcePolicy: { policy: "same-site" },
      // Aucune page de l'application ne doit être intégrée dans un cadre (anti clickjacking)
      frameguard: { action: "deny" },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || isTrustedOrigin(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(cookieParser());
  // Garde-fou global contre l'abus (voir middleware/rateLimiter.ts)
  app.use("/api", apiLimiter);
  app.use("/api", originCheck);
}

// ---------------------------------------------------------------------------
// Validation stricte des paramètres d'URL
// ---------------------------------------------------------------------------

/** Plafond des montants (FCFA) : reste loin de la limite des colonnes INT 32 bits (2 147 483 647). */
export const MAX_AMOUNT = 1_000_000_000;

export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "http.invalidId");

/** Jour calendaire AAAA-MM-JJ réellement existant (2026-02-31 refusé), années 2000-2099. */
export const daySchema = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/, "validation.dateFormat")
  .refine((d) => {
    const parsed = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }, "validation.dateInvalid");

/** Valide les paramètres d'identifiant d'un routeur (`:id`, `:tableId`…) avant tout accès base. */
export function validateIdParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, _res, next, value) => {
      if (!idSchema.safeParse(value).success) return next(new HttpError(400, "http.invalidId"));
      next();
    });
  }
}
