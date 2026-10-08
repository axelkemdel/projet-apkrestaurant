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

authRouter.post("/login", async (req, res) => {
  const { userId, pin } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !(await bcrypt.compare(pin, user.pinHash))) {
    throw new HttpError(401, "Code PIN incorrect");
  }
  const authUser = { id: user.id, name: user.name, role: user.role };
  res.json({ token: signToken(authUser), user: authUser });
});
