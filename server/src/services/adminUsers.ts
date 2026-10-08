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

function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
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

/** Empêche de se retirer soi-même l'accès gérant, ou de supprimer le dernier gérant actif. */
async function assertAdminRemains(targetId: string, actorId: string, next: { role?: Role; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new HttpError(404, "users.notFound");
  const losesAdmin = target.role === "ADMIN" && target.isActive && (next.role !== undefined && next.role !== "ADMIN" || next.isActive === false);
  if (!losesAdmin) return target;
  if (targetId === actorId) throw new HttpError(409, "users.cannotRemoveOwnAdmin");
  const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins <= 1) throw new HttpError(409, "users.lastAdmin");
  return target;
}

/**
 * Modification du profil. Un changement de rôle ou une désactivation invalide
 * les sessions ouvertes de l'employé (il doit se reconnecter / perd l'accès).
 */
export async function updateUser(id: string, raw: unknown, actor: Actor) {
  const input = updateUserSchema.parse(raw);
  const target = await assertAdminRemains(id, actor.id, input);
  const roleChanged = input.role !== undefined && input.role !== target.role;
  const statusChanged = input.isActive !== undefined && input.isActive !== target.isActive;
  const revoke = roleChanged || (statusChanged && input.isActive === false);
  const user = await prisma.$transaction(async (tx) => {
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
 * Réinitialise le PIN (saisi ou généré). Les sessions ouvertes de l'employé
 * sont fermées, sauf s'il s'agit de son propre PIN (le gérant reste connecté).
 */
export async function resetPin(id: string, raw: unknown, actor: Actor) {
  const input = z.object({ pin: pinSchema.optional() }).strict().parse(raw ?? {});
  if (!(await prisma.user.findUnique({ where: { id } }))) throw new HttpError(404, "users.notFound");
  const pin = input.pin ?? generatePin();
  const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
  const revoke = id !== actor.id;
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { pinHash, ...(revoke && { sessionVersion: { increment: 1 } }) },
      select: userSelect,
    });
    if (revoke) await revokeUserSessions(tx, id, "pin_reset");
    // Le PIN lui-même n'est jamais journalisé
    await audit(tx, actor, "PIN_RESET", { targetUserId: id, name: updated.name, generated: !input.pin });
    return updated;
  });
  return { user, pin, revoked: revoke };
}
