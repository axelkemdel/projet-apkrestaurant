import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { audit, type Actor } from "../lib/audit.js";
import { restaurantInfo } from "../lib/restaurant.js";

/** Plan de salle du gérant : tables et jetons des QR codes. */

const tableInput = z
  .object({
    number: z.coerce.number().int().min(1).max(9999),
    capacity: z.coerce.number().int().min(1).max(50).default(4),
    zone: z.string().trim().min(1, "validation.nameRequired").max(30).default("Salle"),
  })
  .strict();

const adminSelect = {
  id: true,
  number: true,
  capacity: true,
  zone: true,
  status: true,
  qrToken: true,
  callRequestedAt: true,
  billRequestedAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.TableSelect;

type AdminTableRow = Prisma.TableGetPayload<{ select: typeof adminSelect }>;

const toAdminTable = ({ _count, ...t }: AdminTableRow) => ({ ...t, deletable: _count.orders === 0 });

function uniqueNumber(e: unknown, number: number): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "table.numberTaken", { number });
  throw e;
}

export async function listAdminTables() {
  const tables = await prisma.table.findMany({ select: adminSelect, orderBy: { number: "asc" } });
  // Nom du restaurant : imprimé sur les supports de QR codes
  return { restaurant: { name: restaurantInfo.name }, tables: tables.map(toAdminTable) };
}

export async function createTable(raw: unknown) {
  const input = tableInput.parse(raw);
  const table = await prisma.table.create({ data: input, select: adminSelect }).catch((e) => uniqueNumber(e, input.number));
  return toAdminTable(table);
}

export async function updateTable(id: string, raw: unknown) {
  const input = tableInput.partial().parse(raw);
  const exists = await prisma.table.count({ where: { id } });
  if (!exists) throw new HttpError(404, "table.notFound");
  const table = await prisma.table
    .update({ where: { id }, data: input, select: adminSelect })
    .catch((e) => uniqueNumber(e, input.number ?? 0));
  return toAdminTable(table);
}

/** Suppression réservée aux tables sans historique (sinon les statistiques et tickets perdraient leur table). */
export async function deleteTable(id: string) {
  const table = await prisma.table.findUnique({ where: { id }, select: adminSelect });
  if (!table) throw new HttpError(404, "table.notFound");
  const payments = await prisma.payment.count({ where: { tableId: id } });
  if (table._count.orders > 0 || payments > 0) throw new HttpError(409, "table.hasHistory");
  await prisma.table.delete({ where: { id } });
  return table;
}

/** Nouveau jeton : l'ancien QR code (photographié, emporté…) cesse immédiatement de fonctionner. */
export async function regenerateQr(id: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.table.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "table.notFound");
    const table = await tx.table.update({ where: { id }, data: { qrToken: randomUUID() }, select: adminSelect });
    await audit(tx, actor, "TABLE_QR_REGENERATED", { tableId: id, table: current.number });
    return toAdminTable(table);
  });
}

// ---------------------------------------------------------------------------
// Avis clients
// ---------------------------------------------------------------------------

const reviewsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

export async function listReviews(raw: unknown) {
  const { limit } = reviewsQuery.parse(raw ?? {});
  const [stats, groups, items] = await Promise.all([
    prisma.review.aggregate({ _avg: { rating: true }, _count: true }),
    prisma.review.groupBy({ by: ["rating"], _count: true }),
    prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, rating: true, comment: true, language: true, createdAt: true, table: { select: { number: true } }, order: { select: { number: true } } },
    }),
  ]);
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: groups.find((g) => g.rating === rating)?._count ?? 0 }));
  return {
    count: stats._count,
    average: stats._avg.rating === null ? null : Math.round(stats._avg.rating * 10) / 10,
    distribution,
    items: items.map((r) => ({ ...r, table: r.table.number, order: r.order?.number ?? null })),
  };
}
