import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { signToken } from "../lib/auth.js";

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

const loginSchema = z.object({ userId: z.string().min(1), pin: z.string().regex(/^\d{4,6}$/) });

// Anti force brute : un PIN à 4 chiffres n'a que 10 000 combinaisons.
// Après MAX_FAILURES échecs sur un même profil, il est verrouillé LOCK_MS.
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

/** Lève le verrouillage d'un profil (après réinitialisation de son PIN par le gérant). */
export function clearLoginFailures(userId: string) {
  failures.delete(userId);
}

authRouter.post("/login", async (req, res) => {
  const { userId, pin } = loginSchema.parse(req.body);
  const state = failures.get(userId);
  if (state && state.lockedUntil > Date.now()) {
    const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60_000);
    throw new HttpError(429, `Trop d'essais : profil verrouillé ${minutes} min`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !(await bcrypt.compare(pin, user.pinHash))) {
    const count = (state && state.lockedUntil <= Date.now() && state.lockedUntil !== 0 ? 0 : state?.count ?? 0) + 1;
    failures.set(userId, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
    if (failures.size > 10_000) failures.clear(); // garde-fou mémoire (identifiants arbitraires)
    throw new HttpError(401, count >= MAX_FAILURES ? "Trop d'essais : profil verrouillé 5 min" : "Code PIN incorrect");
  }
  failures.delete(userId);
  const authUser = { id: user.id, name: user.name, role: user.role };
  res.json({ token: signToken(authUser, user.sessionVersion), user: authUser });
});
