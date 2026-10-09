import { Router, type Request, type RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/errors.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authenticate,
  clearAuthCookies,
  createSession,
  refreshSession,
  revokeSession,
  sessionIdOf,
  type AuthUser,
} from "../lib/auth.js";
import { createLoginLimiters, loginKey, refreshLimiter } from "../middleware/rateLimiter.js";
import { validateBody } from "../middleware/validateZod.js";
import { auditEvent, auditLogger, userAgentOf } from "../middleware/auditLogger.js";
import { loginSchema, verifyCredentials } from "../services/authService.js";
import { disconnectSession } from "../realtime.js";

/**
 * Authentification. Aucune route d'inscription : les comptes sont créés uniquement par
 * le gérant (POST /api/admin/users). Aucune liste de comptes n'est exposée.
 */
export const authRouter = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};
authRouter.use(noStore);

// Identifiant bloqué après trop d'échecs : tracé au journal (sans révéler s'il existe)
const limiters = createLoginLimiters((req) => {
  const username = loginKey(req.body?.username).slice("login:".length);
  void prisma.user
    .findUnique({ where: { username }, select: { id: true, name: true } })
    .then((u) => auditEvent(req, "LOGIN_LOCKED", { targetUsername: username, ...(u && { targetUserId: u.id, targetName: u.name }) }, null))
    .catch((e) => console.error("Audit LOGIN_LOCKED", e));
});

/** Lève le blocage d'un identifiant (après réinitialisation de son PIN par le gérant). */
export function clearLoginFailures(username: string) {
  void limiters.perAccount.resetKey(loginKey(username));
  void limiters.perAccountDaily.resetKey(`daily:${loginKey(username)}`);
}

/**
 * Connexion : identifiant + PIN. Réponse uniforme et à durée constante (≥ LOGIN_MIN_RESPONSE_MS),
 * que l'identifiant existe ou non, que le PIN soit faux ou le compte désactivé.
 */
authRouter.post("/login", limiters.perIp, limiters.perAccount, limiters.perAccountDaily, validateBody(loginSchema), async (req, res) => {
  const started = Date.now();
  // Durée constante : la réponse (succès ou échec) ne part jamais avant LOGIN_MIN_RESPONSE_MS,
  // le temps de réponse ne trahit ni l'existence du compte ni la cause de l'échec
  const padResponse = () => sleep(Math.max(0, env.loginMinResponseMs - (Date.now() - started)));
  const input = req.body as { username: string; pin: string };
  const result = await verifyCredentials(input);
  if (!result.ok) {
    void auditEvent(req, "LOGIN_FAILED", { username: input.username.trim().toLowerCase().slice(0, 32), reason: result.reason, userAgent: userAgentOf(req) ?? null }, result.userId);
    await padResponse();
    throw new HttpError(401, "auth.invalidCredentials");
  }
  const session = await createSession(res, result.user, { ip: req.ip ?? null, userAgent: userAgentOf(req) });
  void auditEvent(req, "LOGIN_SUCCESS", { username: result.user.username, sessionId: session.id, userAgent: userAgentOf(req) ?? null }, result.user.id);
  const { id, name, username, role } = result.user;
  await padResponse();
  res.json({ user: { id, name, username, role } satisfies AuthUser });
});

/** Jeton de rafraîchissement rejoué : session révoquée (fait par refreshSession), temps réel coupé, alerte au journal. */
function onTokenReuse(req: Request, reuse: { userId: string; sessionId: string }) {
  disconnectSession(reuse.sessionId);
  void auditEvent(req, "SESSION_REVOKED", { reason: "refresh_token_reuse", sessionId: reuse.sessionId }, reuse.userId);
}

/** Rafraîchissement explicite (jeton d'accès expiré) : rotation du jeton de rafraîchissement. */
authRouter.post("/refresh", refreshLimiter, async (req, res) => {
  const outcome = await refreshSession(res, req.cookies?.[REFRESH_COOKIE]);
  if ("error" in outcome) {
    clearAuthCookies(res);
    if (outcome.reuse) onTokenReuse(req, outcome.reuse);
    throw outcome.error;
  }
  res.json({ user: outcome.user });
});

/**
 * Session en cours (au chargement de l'application). Jeton d'accès expiré : tentative de
 * rafraîchissement silencieuse. Sans session valide : { user: null } (écran de connexion).
 */
authRouter.get("/me", async (req, res) => {
  try {
    const { user } = await authenticate(req.cookies?.[ACCESS_COOKIE]);
    return void res.json({ user });
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 401) throw err;
  }
  if (!req.cookies?.[REFRESH_COOKIE]) return void res.json({ user: null });
  const outcome = await refreshSession(res, req.cookies[REFRESH_COOKIE]);
  if ("error" in outcome) {
    clearAuthCookies(res);
    if (outcome.reuse) onTokenReuse(req, outcome.reuse);
    return void res.json({ user: null });
  }
  res.json({ user: outcome.user });
});

/** Déconnexion : session révoquée en base (le jeton d'accès devient inutilisable) et cookies effacés. */
authRouter.post("/logout", auditLogger("LOGOUT"), async (req, res) => {
  const sessionId = await sessionIdOf(req);
  if (sessionId) {
    const session = await prisma.authSession.findUnique({ where: { id: sessionId }, select: { userId: true, revokedAt: true } });
    await revokeSession(sessionId, "logout");
    disconnectSession(sessionId);
    if (session && !session.revokedAt) res.locals.audit = { userId: session.userId, details: { sessionId } };
  }
  clearAuthCookies(res);
  res.status(204).end();
});

