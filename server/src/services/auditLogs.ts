import { z } from "zod";
import { AuditAction, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { daySchema, idSchema } from "../lib/security.js";


const day = daySchema;

const querySchema = z
  .object({
    // Liste dérivée du schéma : toute nouvelle action est filtrable sans oubli
    action: z.nativeEnum(AuditAction).optional(),
    userId: idSchema.optional(),
    from: day.optional(),
    to: day.optional(),
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/** Journal d'audit, du plus récent au plus ancien, paginé par curseur. Lecture seule. */
export async function listAuditLogs(rawQuery: unknown) {
  const q = querySchema.parse(rawQuery);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action && { action: q.action }),
    ...(q.userId && { userId: q.userId }),
    ...((q.from || q.to) && {
      timestamp: {
        ...(q.from && { gte: new Date(`${q.from}T00:00:00Z`) }),
        ...(q.to && { lt: new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) }),
      },
    }),
  };
  const rows = await prisma.auditLog.findMany({
    where,
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
