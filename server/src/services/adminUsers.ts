import { randomInt } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { revokeUserSessions } from "../lib/auth.js";
import { BCRYPT_COST, usernameSchema } from "./authService.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { audit, type Actor } from "../lib/audit.js";

/**
 * Les codes PIN sont stockés hachés (bcrypt) : ni la base ni l'API ne peuvent
 * les relire. Un PIN n'est affiché qu'une fois, à la création ou à la
 * réinitialisation, pour être communiqué à l'employé.
 */

const pinSchema = z.string().regex(/^\d{4,6}$/, "validation.pinFormat");
const roleSchema = z.enum(["ADMIN", "SERVEUR", "CUISINE", "CAISSE"]);

const userSelect = { id: true, name: true, username: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } as const;

/** Création d'un collaborateur (inscription publique inexistante : seul le gérant crée des comptes). */
export const createUserSchema = z
  .object({ name: z.string().trim().min(1).max(60), username: usernameSchema, role: roleSchema, pin: pinSchema.optional() })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    username: usernameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/** Identifiant déjà pris → 409 explicite (le gérant est authentifié, aucune fuite). */
function usernameTaken(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "users.usernameTaken");
  throw e;
}

/** PIN généré à 6 chiffres (1 000 000 combinaisons) ; un PIN saisi par le gérant peut en avoir 4 à 6. */
function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function listUsers() {
  return prisma.user.findMany({ select: userSelect, orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }] });
}

export async function createUser(raw: unknown, actor: Actor) {
  const input = createUserSchema.parse(raw);
  const pin = input.pin ?? generatePin();
  const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
  const user = await prisma
    .$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name: input.name, username: input.username, role: input.role, pinHash }, select: userSelect });
      await audit(tx, actor, "USER_CREATED", { targetUserId: created.id, name: created.name, username: created.username, role: created.role });
      return created;
    })
    .catch(usernameTaken);
  return { user, pin };
}

type Tx = Prisma.TransactionClient;

/**
 * Empêche de se retirer soi-même l'accès gérant, ou de supprimer le dernier gérant actif.
 * Exécuté DANS la transaction, gérants actifs verrouillés (FOR UPDATE) : deux gérants qui
 * se rétrograderaient mutuellement au même instant ne peuvent pas laisser zéro gérant.
 */
async function assertAdminRemains(tx: Tx, targetId: string, actorId: string, next: { role?: Role; isActive?: boolean }) {
  const admins = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
  const target = await tx.user.findUnique({ where: { id: targetId } });
  if (!target) throw new HttpError(404, "users.notFound");
  const losesAdmin = target.role === "ADMIN" && target.isActive && (next.role !== undefined && next.role !== "ADMIN" || next.isActive === false);
  if (!losesAdmin) return target;
  if (targetId === actorId) throw new HttpError(409, "users.cannotRemoveOwnAdmin");
  if (admins.length <= 1) throw new HttpError(409, "users.lastAdmin");
  return target;
}

/**
 * Modification du profil. Un changement de rôle ou une désactivation invalide
 * les sessions ouvertes de l'employé (il doit se reconnecter / perd l'accès).
 */
export async function updateUser(id: string, raw: unknown, actor: Actor) {
  const input = updateUserSchema.parse(raw);
  let revoke = false;
  const user = await prisma.$transaction(async (tx) => {
    const target = await assertAdminRemains(tx, id, actor.id, input);
    const roleChanged = input.role !== undefined && input.role !== target.role;
    const statusChanged = input.isActive !== undefined && input.isActive !== target.isActive;
    revoke = roleChanged || (statusChanged && input.isActive === false);
    const updated = await tx.user.update({
      where: { id },
      data: { ...input, ...(revoke && { sessionVersion: { increment: 1 } }) },
      select: userSelect,
    }).catch(usernameTaken);
    if (revoke) await revokeUserSessions(tx, id, roleChanged ? "role_changed" : "deactivated");
    if (roleChanged) {
      await audit(tx, actor, "USER_ROLE_CHANGED", { targetUserId: id, name: updated.name, oldRole: target.role, newRole: updated.role });
    }
    if (statusChanged) {
      await audit(tx, actor, "USER_STATUS_CHANGED", { targetUserId: id, name: updated.name, isActive: updated.isActive });
    }
    return updated;
  });
  return { user, revoked: revoke };
}

/**
 * Réinitialise le PIN (saisi ou généré). Les sessions ouvertes de l'employé sont
 * fermées. S'il s'agit de son propre PIN, le gérant garde la session de CET appareil,
 * mais toutes ses autres sessions sont fermées (un appareil volé perd l'accès).
 */
export async function resetPin(id: string, raw: unknown, actor: Actor, currentSessionId?: string) {
  const input = z.object({ pin: pinSchema.optional() }).strict().parse(raw ?? {});
  if (!(await prisma.user.findUnique({ where: { id } }))) throw new HttpError(404, "users.notFound");
  const pin = input.pin ?? generatePin();
  const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
  const revoke = id !== actor.id;
  const otherSessions = revoke
    ? []
    : await prisma.authSession.findMany({ where: { userId: id, revokedAt: null, ...(currentSessionId && { id: { not: currentSessionId } }) }, select: { id: true } });
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { pinHash, ...(revoke && { sessionVersion: { increment: 1 } }) },
      select: userSelect,
    });
    if (revoke) await revokeUserSessions(tx, id, "pin_reset");
    else await revokeUserSessions(tx, id, "pin_reset", currentSessionId);
    // Le PIN lui-même n'est jamais journalisé
    await audit(tx, actor, "PIN_RESET", { targetUserId: id, name: updated.name, generated: !input.pin });
    return updated;
  });
  return { user, pin, revoked: revoke, revokedSessionIds: otherSessions.map((s) => s.id) };
}
