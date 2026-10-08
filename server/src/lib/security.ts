import type { Express, RequestHandler, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import { env } from "./env.js";
import { HttpError } from "./errors.js";

/** Origine autorisée : liste CORS_ORIGIN, ou même hôte que le serveur (accès direct / proxy). */
export function isAllowedOrigin(origin: string, host: string | undefined) {
  if (env.corsOrigin.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Défense CSRF en profondeur (en plus de SameSite=Strict) : toute requête
 * modifiante venant d'un navigateur doit provenir d'une origine autorisée.
 */
const originCheck: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin, req.headers.host)) throw new HttpError(403, "Origine non autorisée");
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
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigin.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(cookieParser());
  // Garde-fou global contre l'abus (toutes les tablettes d'un restaurant partagent souvent une IP)
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Trop de requêtes, réessayez dans un instant" },
    }),
  );
  app.use("/api", originCheck);
}

// ---------------------------------------------------------------------------
// Anti force brute sur le code PIN
// ---------------------------------------------------------------------------

/** Clé par profil : 5 PIN erronés sur un même employé → profil bloqué 5 min, quelle que soit la tablette. */
export const pinKey = (userId: string) => `pin:${userId}`;

export function createLoginLimiters(onLocked: (userId: string, ip: string | null) => void) {
  const perProfile = rateLimit({
    windowMs: 5 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => pinKey(String(req.body?.userId ?? "").slice(0, 64)),
    handler: (req, res, _next, options) => {
      onLocked(String(req.body?.userId ?? ""), req.ip ?? null);
      res.status(options.statusCode).json({ error: "Trop d'essais : profil verrouillé 5 min" });
    },
  });
  // Par appareil (IP) : empêche d'essayer quelques PIN sur chacun des profils
  const perIp = rateLimit({
    windowMs: 5 * 60_000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    message: { error: "Trop d'essais depuis cet appareil, réessayez dans 5 min" },
  });
  return { perProfile, perIp };
}

// ---------------------------------------------------------------------------
// Validation stricte des paramètres d'URL
// ---------------------------------------------------------------------------

export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "Identifiant invalide");

/** Valide les paramètres d'identifiant d'un routeur (`:id`, `:tableId`…) avant tout accès base. */
export function validateIdParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, _res, next, value) => {
      if (!idSchema.safeParse(value).success) return next(new HttpError(400, "Identifiant invalide"));
      next();
    });
  }
}
