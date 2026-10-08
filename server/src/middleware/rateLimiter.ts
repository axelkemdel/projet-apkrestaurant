import type { Request, RequestHandler, Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { env } from "../lib/env.js";
import { langOf, translate, type MessageKey } from "../lib/i18n.js";

function sendError(req: Request, res: Response, status: number, code: MessageKey) {
  res.status(status).json({ code, error: translate(langOf(req), code) });
}

const common = { standardHeaders: "draft-8" as const, legacyHeaders: false };
const ip = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** Garde-fou global de l'API (toutes les tablettes d'un restaurant partagent souvent une IP). */
export const apiLimiter: RequestHandler = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 600,
  handler: (req, res, _next, options) => sendError(req, res, options.statusCode, "http.tooManyRequests"),
});

// ---------------------------------------------------------------------------
// Anti force brute à la connexion
// ---------------------------------------------------------------------------

const LOGIN_WINDOW_MS = 5 * 60_000;

/** Identifiant tel que saisi, normalisé : la clé existe que le compte existe ou non (aucune fuite). */
export const loginKey = (username: unknown) => `login:${String(username ?? "").trim().toLowerCase().slice(0, 64)}`;

/**
 * Deux compteurs d'échecs sur 5 minutes (les connexions réussies ne comptent pas) :
 *  - par identifiant : LOGIN_MAX_ATTEMPTS_ACCOUNT (5) essais, quelle que soit la tablette ;
 *  - par appareil (IP) : LOGIN_MAX_ATTEMPTS_IP (10) essais, tous identifiants confondus —
 *    un peu plus large car les tablettes d'un restaurant sortent souvent par la même IP.
 * Message identique dans les deux cas : il ne révèle pas si l'identifiant existe.
 */
export function createLoginLimiters(onAccountLocked: (req: Request) => void) {
  const perAccount = rateLimit({
    ...common,
    windowMs: LOGIN_WINDOW_MS,
    limit: env.loginMaxAttemptsAccount,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => loginKey(req.body?.username),
    handler: (req, res, _next, options) => {
      onAccountLocked(req);
      sendError(req, res, options.statusCode, "auth.tooManyAttempts");
    },
  });
  const perIp = rateLimit({
    ...common,
    windowMs: LOGIN_WINDOW_MS,
    limit: env.loginMaxAttemptsIp,
    skipSuccessfulRequests: true,
    keyGenerator: ip,
    handler: (req, res, _next, options) => sendError(req, res, options.statusCode, "auth.tooManyAttempts"),
  });
  return { perAccount, perIp };
}

/** Rafraîchissement de session : largement suffisant pour un usage normal (1 / 15 min par écran). */
export const refreshLimiter: RequestHandler = rateLimit({
  ...common,
  windowMs: LOGIN_WINDOW_MS,
  limit: 60,
  keyGenerator: ip,
  handler: (req, res, _next, options) => sendError(req, res, options.statusCode, "http.tooManyRequests"),
});

/** Limiteur par appareil ET par clé métier (ex. jeton de table du portail client). */
export function keyedLimiter(windowMs: number, limit: number, code: MessageKey, keyOf: (req: Request) => string): RequestHandler {
  return rateLimit({
    ...common,
    windowMs,
    limit,
    keyGenerator: (req) => `${ip(req)}:${keyOf(req)}`,
    handler: (req, res, _next, options) => sendError(req, res, options.statusCode, code),
  });
}
