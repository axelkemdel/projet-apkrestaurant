import type { AuditAction, Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma.js";

/** Auteur d'une action : utilisateur connecté + adresse IP de l'appareil. */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  ip: string | null;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Trace une action critique. À appeler DANS la transaction de l'action : si
 * l'écriture du journal échoue, l'action est annulée (pas d'action sans trace).
 */
export function audit(
  db: Db,
  actor: Pick<Actor, "id" | "ip"> | { id: null; ip: string | null },
  action: AuditAction,
  details: Prisma.InputJsonObject,
) {
  return db.auditLog.create({
    data: { userId: actor.id, action, details, ipAddress: actor.ip?.slice(0, 64) ?? null },
  });
}

/** Champs modifiés entre deux états, au format { champ: { from, to } } (comparaison JSON). */
export function diffFields<T extends object>(before: T, after: T, keys: (keyof T & string)[]): Prisma.InputJsonObject {
  const changes: Record<string, Prisma.InputJsonValue> = {};
  for (const key of keys) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to } as unknown as Prisma.InputJsonValue;
  }
  return changes;
}
