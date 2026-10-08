import { prisma } from "../lib/prisma.js";

export function listTables() {
  return prisma.table.findMany({
    orderBy: { number: "asc" },
    include: {
      _count: { select: { orders: { where: { status: { notIn: ["PAID", "CANCELLED"] } } } } },
    },
  });
}

/** Libère la table si plus aucun bon n'y est ouvert. Renvoie la table si son statut a changé. */
export async function releaseTableIfIdle(tableId: string | null) {
  if (!tableId) return null;
  const open = await prisma.order.count({
    where: { tableId, status: { notIn: ["PAID", "CANCELLED"] } },
  });
  if (open > 0) return null;
  const { count } = await prisma.table.updateMany({
    where: { id: tableId, status: "OCCUPIED" },
    data: { status: "FREE" },
  });
  return count ? prisma.table.findUnique({ where: { id: tableId } }) : null;
}
