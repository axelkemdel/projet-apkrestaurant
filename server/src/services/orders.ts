import { z } from "zod";
import type { OrderSource, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { audit, type Actor } from "../lib/audit.js";
import { MAX_AMOUNT, idSchema } from "../lib/security.js";
import { normalizeOptions, QUICK_NOTES } from "../lib/menuOptions.js";

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

/** Ligne de commande : identifiants et choix uniquement, jamais de prix. */
export const orderLineSchema = z
  .object({
    menuItemId: idSchema,
    quantity: z.number().int().min(1).max(50),
    notes: z.string().max(200).optional(),
    quickNotes: z.array(z.enum(QUICK_NOTES)).max(QUICK_NOTES.length).default([]),
    // Valeurs de référence (françaises) des options choisies
    cooking: z.string().max(40).optional(),
    side: z.string().max(40).optional(),
    extras: z.array(z.string().max(40)).max(10).default([]),
  })
  .strict();

export const createOrderSchema = z
  .object({
    type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
    tableId: idSchema.optional(),
    customerNote: z.string().max(300).optional(),
    /** Langue dans laquelle la commande a été prise (interface du serveur / client). */
    language: z.enum(["FR", "EN"]).default("FR"),
    items: z.array(orderLineSchema).min(1, "validation.emptyOrder").max(100),
  })
  .strict()
  .refine((o) => o.type !== "DINE_IN" || o.tableId, {
    message: "validation.tableRequired",
    path: ["tableId"],
  });

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const updateStatusSchema = z
  .object({ status: z.enum(["PREPARING", "READY", "SERVED", "CANCELLED"]) })
  .strict();

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export const orderInclude = {
  table: { select: { id: true, number: true, zone: true } },
  server: { select: { id: true, name: true } },
  items: { orderBy: { id: "asc" } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Commandes encore à traiter par la cuisine / le bar ou à servir. */
export function listActiveOrders() {
  return prisma.order.findMany({
    where: { status: { in: ["PENDING", "PREPARING", "READY"] } },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
  });
}

/** Bons non soldés d'une table (pour afficher « déjà commandé » côté serveur). */
export function listOpenOrdersForTable(tableId: string) {
  return prisma.order.findMany({
    where: { tableId, status: { notIn: ["PAID", "CANCELLED"] } },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

/**
 * Crée un bon de commande. Les prix sont toujours recalculés côté serveur à
 * partir de la carte : le client n'envoie que des identifiants et des choix.
 * Ajouter des articles à une table déjà servie = créer un nouveau bon pour
 * cette table (c'est ce que la cuisine doit préparer) ; l'addition en caisse
 * regroupe tous les bons non soldés de la table.
 */
export async function createOrder(
  raw: unknown,
  serverId: string | null,
  source: OrderSource = "STAFF",
): Promise<OrderWithRelations> {
  const input = createOrderSchema.parse(raw);

  return prisma.$transaction(async (tx) => {
    if (input.tableId) {
      // Même verrou que l'encaissement : un bon ne peut pas se glisser pendant la clôture de l'addition
      const table = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Table" WHERE id = ${input.tableId} FOR UPDATE`;
      if (!table.length) throw new HttpError(404, "table.notFound");
    }

    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: ids } },
      include: { category: { select: { station: true } } },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    const lines = input.items.map((line) => {
      const item = byId.get(line.menuItemId);
      if (!item || item.isArchived) throw new HttpError(404, "order.itemNotFound");
      const names = { name_fr: item.nameFr, name_en: item.nameEn };
      if (!item.isAvailable) throw new HttpError(409, "order.itemUnavailable", names);

      // Options validées contre la carte ; on fige les libellés dans les deux langues
      const options = normalizeOptions(item.options);
      const cooking = line.cooking ? options.cooking?.find((c) => c.fr === line.cooking) : undefined;
      if (line.cooking && !cooking) throw new HttpError(400, "order.invalidCooking", names);
      const side = line.side ? options.sides?.find((c) => c.fr === line.side) : undefined;
      if (line.side && !side) throw new HttpError(400, "order.invalidSide", names);
      const extras = [...new Set(line.extras)].map((fr) => {
        const extra = options.extras?.find((e) => e.fr === fr);
        if (!extra) throw new HttpError(400, "order.invalidExtra", { ...names, extra: fr });
        return extra;
      });

      const unitPrice = item.price + extras.reduce((sum, e) => sum + e.price, 0);
      const modifiers = {
        ...(cooking && { cooking }),
        ...(side && { side }),
        ...(extras.length && { extras }),
      };

      return {
        menuItemId: item.id,
        nameFr: item.nameFr,
        nameEn: item.nameEn,
        quantity: line.quantity,
        unitPrice,
        quickNotes: [...new Set(line.quickNotes)],
        notes: line.notes?.trim() || null,
        modifiers: Object.keys(modifiers).length ? (modifiers as unknown as Prisma.InputJsonObject) : undefined,
        station: item.category.station,
      };
    });

    const totalAmount = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    // Colonnes INT (32 bits) : un total aberrant est refusé proprement plutôt que de faire échouer la base
    if (totalAmount > MAX_AMOUNT) throw new HttpError(400, "validation.amountTooLarge");

    const order = await tx.order.create({
      data: {
        type: input.type,
        tableId: input.type === "DINE_IN" ? input.tableId : null,
        serverId,
        source,
        customerNote: input.customerNote?.trim() || null,
        language: input.language,
        totalAmount,
        items: { create: lines },
      },
      include: orderInclude,
    });

    if (order.tableId) {
      await tx.table.update({ where: { id: order.tableId }, data: { status: "OCCUPIED" } });
    }

    return order;
  });
}

// ---------------------------------------------------------------------------
// Cycle de vie (KDS)
// ---------------------------------------------------------------------------

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "PREPARING"],
  SERVED: [],
  PAID: [],
  CANCELLED: [],
};

const timestampField: Partial<Record<OrderStatus, "startedAt" | "readyAt" | "servedAt">> = {
  PREPARING: "startedAt",
  READY: "readyAt",
  SERVED: "servedAt",
};

export async function updateOrderStatus(orderId: string, raw: unknown, actor: Actor): Promise<OrderWithRelations> {
  const { status } = updateStatusSchema.parse(raw);

  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, table: true } });
    if (!current) throw new HttpError(404, "order.notFound");
    if (!transitions[current.status].includes(status)) {
      throw new HttpError(409, "order.transition", { from: current.status, to: status });
    }

    if (status === "CANCELLED") {
      // Verrou partagé avec l'encaissement (table, sinon bon) : pas d'annulation pendant un paiement
      if (current.tableId) await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${current.tableId} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const settled = await tx.order.count({
        where: { id: orderId, OR: [{ payments: { some: {} } }, { discounts: { some: {} } }] },
      });
      if (settled) throw new HttpError(409, "order.cannotCancelSettled");
    }

    const field = timestampField[status];
    // Addition déjà réglée en caisse : une fois servi, le bon est directement soldé.
    const finalStatus = status === "SERVED" && current.paidAt ? "PAID" : status;
    // Mise à jour conditionnelle : si deux écrans cliquent en même temps, un seul gagne.
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { status: finalStatus, ...(field && { [field]: new Date() }) },
    });
    if (count === 0) throw new HttpError(409, "order.concurrentChange");

    // Anti-fraude : une annulation (plats non facturés) est toujours tracée, dans la même transaction
    if (status === "CANCELLED") {
      await audit(tx, actor, "ORDER_CANCELLED", {
        orderId,
        orderNumber: current.number,
        table: current.table?.number ?? null,
        previousStatus: current.status,
        amount: current.totalAmount,
        items: current.items.map((i) => ({ nameFr: i.nameFr, nameEn: i.nameEn, quantity: i.quantity, unitPrice: i.unitPrice })),
      });
    }

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
}
