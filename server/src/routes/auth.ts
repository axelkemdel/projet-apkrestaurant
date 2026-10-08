import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { authenticate, endSession, SESSION_COOKIE, startSession } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { createLoginLimiters, idSchema, pinKey } from "../lib/security.js";

export const authRouter = Router();

/** Liste des profils pour l'écran de connexion (tuiles nom + rôle, sans donnée sensible). */
authRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  res.json(users);
});

const loginSchema = z.object({ userId: idSchema, pin: z.string().regex(/^\d{4,6}$/) }).strict();

// Anti force brute (express-rate-limit) : 5 PIN erronés / 5 min par profil, 30 par appareil.
// Le verrouillage d'un profil est tracé dans le journal d'audit.
const limiters = createLoginLimiters((userId, ip) => {
  if (!idSchema.safeParse(userId).success) return;
  void prisma.user
    .findUnique({ where: { id: userId }, select: { name: true } })
    .then((u) => u && audit(prisma, { id: null, ip }, "LOGIN_LOCKED", { targetUserId: userId, targetName: u.name }))
    .catch((e) => console.error("Audit LOGIN_LOCKED", e));
});

/** Lève le verrouillage d'un profil (après réinitialisation de son PIN par le gérant). */
export function clearLoginFailures(userId: string) {
  void limiters.perProfile.resetKey(pinKey(userId));
}

authRouter.post("/login", limiters.perIp, limiters.perProfile, async (req, res) => {
  const { userId, pin } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !(await bcrypt.compare(pin, user.pinHash))) {
    throw new HttpError(401, "auth.badPin");
  }
  startSession(res, user); // cookie HttpOnly, aucun jeton exposé au JavaScript
  res.json({ user: { id: user.id, name: user.name, role: user.role } });
});

/**
 * Session en cours (au chargement de l'application). Sans session valide, répond
 * { user: null } : ce n'est pas une erreur, l'écran de connexion s'affiche.
 */
authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return void res.json({ user: null });
  try {
    const { user } = await authenticate(token);
    res.json({ user });
  } catch (err) {
    if (!(err instanceof HttpError) || err.status !== 401) throw err;
    endSession(res);
    res.json({ user: null });
  }
});

authRouter.post("/logout", (_req, res) => {
  endSession(res);
  res.status(204).end();
});
