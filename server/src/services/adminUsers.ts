import { randomInt } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";

/**
 * Les codes PIN sont stockés hachés (bcrypt) : ni la base ni l'API ne peuvent
 * les relire. Un PIN n'est affiché qu'une fois, à la création ou à la
 * réinitialisation, pour être communiqué à l'employé.
 */

const pinSchema = z.string().regex(/^\d{4,6}$/, "Le code PIN doit comporter 4 à 6 chiffres");
const roleSchema = z.enum(["ADMIN", "SERVEUR", "CUISINE", "CAISSE"]);

const userSelect = { id: true, name: true, role: true, isActive: true, createdAt: true } as const;

function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

export function listUsers() {
  return prisma.user.findMany({ select: userSelect, orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }] });
}

export async function createUser(raw: unknown) {
  const input = z
    .object({ name: z.string().trim().min(1).max(60), role: roleSchema, pin: pinSchema.optional() })
    .parse(raw);
  const pin = input.pin ?? generatePin();
  const user = await prisma.user.create({
    data: { name: input.name, role: input.role, pinHash: await bcrypt.hash(pin, 10) },
    select: userSelect,
  });
  return { user, pin };
}

/** Empêche de se retirer soi-même l'accès gérant, ou de supprimer le dernier gérant actif. */
async function assertAdminRemains(targetId: string, actorId: string, next: { role?: Role; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new HttpError(404, "Employé introuvable");
  const losesAdmin = target.role === "ADMIN" && target.isActive && (next.role !== undefined && next.role !== "ADMIN" || next.isActive === false);
  if (!losesAdmin) return target;
  if (targetId === actorId) throw new HttpError(409, "Vous ne pouvez pas retirer votre propre accès gérant");
  const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
  if (admins <= 1) throw new HttpError(409, "Il doit rester au moins un gérant actif");
  return target;
}

/**
 * Modification du profil. Un changement de rôle ou une désactivation invalide
 * les sessions ouvertes de l'employé (il doit se reconnecter / perd l'accès).
 */
export async function updateUser(id: string, raw: unknown, actorId: string) {
  const input = z
    .object({ name: z.string().trim().min(1).max(60).optional(), role: roleSchema.optional(), isActive: z.boolean().optional() })
    .parse(raw);
  const target = await assertAdminRemains(id, actorId, input);
  const revoke = (input.role !== undefined && input.role !== target.role) || (input.isActive === false && target.isActive);
  const user = await prisma.user.update({
    where: { id },
    data: { ...input, ...(revoke && { sessionVersion: { increment: 1 } }) },
    select: userSelect,
  });
  return { user, revoked: revoke };
}

/**
 * Réinitialise le PIN (saisi ou généré). Les sessions ouvertes de l'employé
 * sont fermées, sauf s'il s'agit de son propre PIN (le gérant reste connecté).
 */
export async function resetPin(id: string, raw: unknown, actorId: string) {
  const input = z.object({ pin: pinSchema.optional() }).parse(raw ?? {});
  if (!(await prisma.user.findUnique({ where: { id } }))) throw new HttpError(404, "Employé introuvable");
  const pin = input.pin ?? generatePin();
  const revoke = id !== actorId;
  const user = await prisma.user.update({
    where: { id },
    data: { pinHash: await bcrypt.hash(pin, 10), ...(revoke && { sessionVersion: { increment: 1 } }) },
    select: userSelect,
  });
  return { user, pin, revoked: revoke };
}
