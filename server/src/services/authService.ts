import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

/** Coût bcrypt des codes PIN (2^12 itérations) ; les anciens hachages plus faibles sont mis à niveau à la connexion. */
export const BCRYPT_COST = 12;

/**
 * Empreinte factice comparée quand l'identifiant n'existe pas : le travail bcrypt est
 * le même, qu'un compte existe ou non (pas de déduction par le temps de réponse).
 */
const DUMMY_HASH = bcrypt.hashSync("restoapp-dummy-pin", BCRYPT_COST);

/** Format attendu ; le contenu est vérifié sans court-circuit pour ne rien révéler. */
export const loginSchema = z
  .object({
    username: z.string().max(64),
    pin: z.string().max(64),
  })
  .strict();

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "validation.usernameFormat");

export type LoginResult =
  | { ok: true; user: { id: string; name: string; username: string; role: "ADMIN" | "SERVEUR" | "CUISINE" | "CAISSE"; sessionVersion: number } }
  | { ok: false; userId: string | null; reason: "UNKNOWN_USER" | "BAD_PIN" | "INACTIVE" };

/**
 * Vérifie identifiant + PIN. Toujours exactement UNE comparaison bcrypt (vraie ou factice),
 * quel que soit le motif d'échec ; le motif n'est jamais renvoyé au client (message
 * unique « Identifiants invalides »), il sert uniquement au journal d'audit.
 */
export async function verifyCredentials(input: z.infer<typeof loginSchema>): Promise<LoginResult> {
  const username = input.username.trim().toLowerCase();
  const user = /^[a-z0-9._-]{3,32}$/.test(username) ? await prisma.user.findUnique({ where: { username } }) : null;
  const pinMatches = await bcrypt.compare(input.pin, user?.pinHash ?? DUMMY_HASH);
  const pinWellFormed = /^\d{4,6}$/.test(input.pin);
  if (!user) return { ok: false, userId: null, reason: "UNKNOWN_USER" };
  if (!pinMatches || !pinWellFormed) return { ok: false, userId: user.id, reason: "BAD_PIN" };
  if (!user.isActive) return { ok: false, userId: user.id, reason: "INACTIVE" };

  const upgrade = bcrypt.getRounds(user.pinHash) < BCRYPT_COST ? await bcrypt.hash(input.pin, BCRYPT_COST) : null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...(upgrade && { pinHash: upgrade }) } });
  return { ok: true, user };
}
