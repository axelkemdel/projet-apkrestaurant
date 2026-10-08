import type { Express, RequestHandler, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { env } from "./env.js";
import { HttpError } from "./errors.js";

/** Origine autorisée : liste CORS_ORIGIN, ou même hôte que le serveur (accès direct / proxy). */
export function isAllowedOrigin(origin: string, host: string | undefined, forwardedHost?: string | string[]) {
  if (env.corsOrigin.includes(origin)) return true;
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
  if (origin && !isAllowedOrigin(origin, req.headers.host, req.headers["x-forwarded-host"])) throw new HttpError(403, "http.originNotAllowed");
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
  // Garde-fou global contre l'abus (voir middleware/rateLimiter.ts)
  app.use("/api", apiLimiter);
  app.use("/api", originCheck);
}

// ---------------------------------------------------------------------------
// Validation stricte des paramètres d'URL
// ---------------------------------------------------------------------------

export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "http.invalidId");

/** Valide les paramètres d'identifiant d'un routeur (`:id`, `:tableId`…) avant tout accès base. */
export function validateIdParams(router: Router, ...names: string[]) {
  for (const name of names) {
    router.param(name, (_req, _res, next, value) => {
      if (!idSchema.safeParse(value).success) return next(new HttpError(400, "http.invalidId"));
      next();
    });
  }
}
