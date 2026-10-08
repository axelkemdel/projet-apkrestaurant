import { z } from "zod";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

export const createOrderSchema = z
  .object({
    type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
    tableId: z.string().min(1).optional(),
    customerNote: z.string().max(300).optional(),
    items: z
      .array(
        z.object({
          menuItemId: z.string().min(1),
          quantity: z.number().int().min(1).max(50),
          notes: z.string().max(200).optional(),
          cooking: z.string().optional(),
          side: z.string().optional(),
          extras: z.array(z.string()).max(10).default([]),
        }),
      )
      .min(1, "La commande est vide"),
  })
  .refine((o) => o.type !== "DINE_IN" || o.tableId, {
    message: "Une table est requise pour une commande sur place",
    path: ["tableId"],
  });

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(["PREPARING", "READY", "SERVED", "CANCELLED"]),
});

/** Options configurables d'un plat (champ JSON `MenuItem.options`). */
const menuOptionsSchema = z
  .object({
    cooking: z.array(z.string()).optional(),
    sides: z.array(z.string()).optional(),
    extras: z.array(z.object({ name: z.string(), price: z.number().int().min(0) })).optional(),
  })
  .nullish();

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
export async function createOrder(raw: unknown, serverId: string): Promise<OrderWithRelations> {
  const input = createOrderSchema.parse(raw);

  return prisma.$transaction(async (tx) => {
    if (input.tableId) {
      const table = await tx.table.findUnique({ where: { id: input.tableId } });
      if (!table) throw new HttpError(404, "Table introuvable");
    }

    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: ids } },
      include: { category: { select: { station: true } } },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    const lines = input.items.map((line) => {
      const item = byId.get(line.menuItemId);
      if (!item) throw new HttpError(404, "Article introuvable dans la carte");
      if (!item.isAvailable) throw new HttpError(409, `« ${item.name} » n'est plus disponible`);

      const options = menuOptionsSchema.parse(item.options) ?? {};
      if (line.cooking && !options.cooking?.includes(line.cooking)) {
        throw new HttpError(400, `Cuisson invalide pour « ${item.name} »`);
      }
      if (line.side && !options.sides?.includes(line.side)) {
        throw new HttpError(400, `Accompagnement invalide pour « ${item.name} »`);
      }
      const extras = [...new Set(line.extras)].map((name) => {
        const extra = options.extras?.find((e) => e.name === name);
        if (!extra) throw new HttpError(400, `Supplément « ${name} » invalide pour « ${item.name} »`);
        return extra;
      });

      const unitPrice = item.price + extras.reduce((sum, e) => sum + e.price, 0);
      const modifiers = {
        ...(line.cooking && { cooking: line.cooking }),
        ...(line.side && { side: line.side }),
        ...(extras.length && { extras }),
      };

      return {
        menuItemId: item.id,
        name: item.name,
        quantity: line.quantity,
        unitPrice,
        notes: line.notes?.trim() || null,
        modifiers: Object.keys(modifiers).length ? modifiers : undefined,
        station: item.category.station,
      };
    });

    const totalAmount = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

    const order = await tx.order.create({
      data: {
        type: input.type,
        tableId: input.type === "DINE_IN" ? input.tableId : null,
        serverId,
        customerNote: input.customerNote?.trim() || null,
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

export async function updateOrderStatus(orderId: string, raw: unknown): Promise<OrderWithRelations> {
  const { status } = updateStatusSchema.parse(raw);

  const current = await prisma.order.findUnique({ where: { id: orderId } });
  if (!current) throw new HttpError(404, "Commande introuvable");
  if (!transitions[current.status].includes(status)) {
    throw new HttpError(409, `Transition impossible : ${current.status} → ${status}`);
  }

  if (status === "CANCELLED" && (await prisma.payment.count({ where: { orders: { some: { id: orderId } } } }))) {
    throw new HttpError(409, "Un versement a déjà été encaissé sur ce bon : annulation impossible");
  }

  const field = timestampField[status];
  // Addition déjà réglée en caisse : une fois servi, le bon est directement soldé.
  const finalStatus = status === "SERVED" && current.paidAt ? "PAID" : status;
  // Mise à jour conditionnelle : si deux écrans cliquent en même temps, un seul gagne.
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: current.status },
    data: { status: finalStatus, ...(field && { [field]: new Date() }) },
  });
  if (count === 0) throw new HttpError(409, "La commande a été modifiée entre-temps");

  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}
