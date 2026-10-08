import { z } from "zod";
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { restaurantInfo } from "../lib/restaurant.js";
import { orderInclude, type OrderWithRelations } from "./orders.js";
import { env } from "../lib/env.js";
import { audit, type Actor } from "../lib/audit.js";
import { idSchema } from "../lib/security.js";

type Tx = Prisma.TransactionClient;

/**
 * Une « addition » regroupe ce qu'un client (ou une tablée) doit :
 *  - sur place : tous les bons non soldés et non annulés de la table ;
 *  - à emporter / livraison : un bon unique.
 * Les versements sont rattachés aux bons qu'ils couvrent ; le solde est
 * total des bons − somme des versements liés à ces bons.
 */
export type BillTarget = { tableId: string; orderId?: undefined } | { orderId: string; tableId?: undefined };

const IN_KITCHEN: OrderStatus[] = ["PENDING", "PREPARING"];

const paymentInclude = {
  cashier: { select: { id: true, name: true } },
  items: { include: { orderItem: { select: { name: true, unitPrice: true } } } },
} satisfies Prisma.PaymentInclude;

function billWhere(target: BillTarget): Prisma.OrderWhereInput {
  const open = { paidAt: null, status: { not: "CANCELLED" as const } };
  return target.tableId ? { ...open, tableId: target.tableId } : { ...open, id: target.orderId, tableId: null };
}

async function loadBill(tx: Tx, target: BillTarget) {
  const orders = await tx.order.findMany({
    where: billWhere(target),
    include: orderInclude,
    orderBy: { createdAt: "asc" },
  });
  const orderIds = orders.map((o) => o.id);
  const payments = orderIds.length
    ? await tx.payment.findMany({
        where: { orders: { some: { id: { in: orderIds } } } },
        include: paymentInclude,
        orderBy: { createdAt: "asc" },
      })
    : [];
  const discounts = orderIds.length
    ? await tx.discount.findMany({
        where: { orders: { some: { id: { in: orderIds } } } },
        include: { cashier: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const total = orders.reduce((s, o) => s + o.totalAmount, 0);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const discounted = discounts.reduce((s, d) => s + d.amount, 0);
  const unpaidItemsAmount = orders
    .flatMap((o) => o.items)
    .reduce((s, i) => s + (i.quantity - i.paidQuantity) * i.unitPrice, 0);

  return {
    orders,
    payments,
    discounts,
    totals: { total, discounted, paid, remaining: Math.max(0, total - discounted - paid), unpaidItemsAmount },
    inKitchen: orders.filter((o) => IN_KITCHEN.includes(o.status)).length,
  };
}

export async function getTableBill(tableId: string) {
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table) throw new HttpError(404, "Table introuvable");
  const bill = await loadBill(prisma, { tableId });
  return { target: { kind: "table" as const, table }, ...bill };
}

export async function getOrderBill(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Commande introuvable");
  if (order.tableId) throw new HttpError(400, "Ce bon appartient à une table : encaissez l'addition de la table");
  const bill = await loadBill(prisma, { orderId });
  return { target: { kind: "order" as const, order: { id: order.id, number: order.number, type: order.type } }, ...bill };
}

// ---------------------------------------------------------------------------
// Vue d'ensemble (plan de salle de la caisse)
// ---------------------------------------------------------------------------

export async function getCheckoutOverview() {
  const [tables, openOrders] = await Promise.all([
    prisma.table.findMany({ orderBy: { number: "asc" } }),
    prisma.order.findMany({
      where: { paidAt: null, status: { not: "CANCELLED" } },
      select: {
        id: true,
        number: true,
        type: true,
        tableId: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        server: { select: { name: true } },
        payments: { select: { id: true, amount: true } },
        discounts: { select: { id: true, amount: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Un versement peut couvrir plusieurs bons : on ne le compte qu'une fois par addition
  function summarize(orders: typeof openOrders) {
    const payments = new Map<string, number>();
    const discounts = new Map<string, number>();
    orders.forEach((o) => o.payments.forEach((p) => payments.set(p.id, p.amount)));
    orders.forEach((o) => o.discounts.forEach((d) => discounts.set(d.id, d.amount)));
    const total = orders.reduce((s, o) => s + o.totalAmount, 0);
    const paid = [...payments.values()].reduce((s, a) => s + a, 0);
    const discounted = [...discounts.values()].reduce((s, a) => s + a, 0);
    return {
      total,
      paid,
      discounted,
      remaining: Math.max(0, total - discounted - paid),
      orderCount: orders.length,
      inKitchen: orders.filter((o) => IN_KITCHEN.includes(o.status)).length,
      since: orders[0]?.createdAt ?? null,
    };
  }

  return {
    tables: tables.map((t) => ({ ...t, bill: summarize(openOrders.filter((o) => o.tableId === t.id)) })),
    takeaway: openOrders
      .filter((o) => !o.tableId)
      .map((o) => ({ id: o.id, number: o.number, type: o.type, status: o.status, server: o.server.name, bill: summarize([o]) })),
  };
}

// ---------------------------------------------------------------------------
// Encaissement
// ---------------------------------------------------------------------------

export const payInputSchema = z
  .object({
    tableId: idSchema.optional(),
    orderId: idSchema.optional(),
    mode: z.enum(["CASH", "CARD", "ORANGE_MONEY", "TELECEL_CASH"]),
    /** Montant à imputer (division égale, acompte, solde). Ignoré si `items` est fourni. */
    amount: z.number().int().positive().optional(),
    /** Paiement par sélection d'articles : le montant est calculé côté serveur. */
    items: z
      .array(z.object({ orderItemId: idSchema, quantity: z.number().int().positive().max(1000) }).strict())
      .min(1)
      .optional(),
    /** Espèces remises par le client (rendu de monnaie calculé côté serveur). */
    amountReceived: z.number().int().positive().optional(),
    reference: z.string().trim().max(60).optional(),
    label: z.string().trim().max(40).optional(),
  })
  .strict()
  .refine((p) => Boolean(p.tableId) !== Boolean(p.orderId), {
    message: "Indiquez soit une table, soit un bon à emporter",
  })
  .refine((p) => p.items || p.amount, { message: "Montant ou articles requis", path: ["amount"] });

export type PayInput = z.input<typeof payInputSchema>;

export interface BillChange {
  remaining: number;
  closed: boolean;
  tableId: string | null;
  orderIds: string[];
  updatedOrders: OrderWithRelations[];
  tableReleased: { id: string; number: number; status: "FREE" } | null;
}

export interface PayResult extends BillChange {
  payment: Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
  remaining: number;
  closed: boolean;
  tableId: string | null;
  orderIds: string[];
  /** Bons dont le statut a changé (→ PAID) à diffuser au KDS / aux serveurs. */
  updatedOrders: OrderWithRelations[];
  tableReleased: { id: string; number: number; status: "FREE" } | null;
}

/** Verrou sur la table (ou le bon) : deux caisses ne peuvent pas modifier la même addition en même temps. */
async function lockTarget(tx: Tx, target: BillTarget) {
  if (target.tableId) {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Table" WHERE id = ${target.tableId} FOR UPDATE`;
    if (!locked.length) throw new HttpError(404, "Table introuvable");
  } else {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE id = ${target.orderId} FOR UPDATE`;
    if (!locked.length) throw new HttpError(404, "Commande introuvable");
  }
}

/**
 * Addition soldée (solde à 0 par versements et/ou remises) : bons → PAID
 * (ceux encore en cuisine le deviendront une fois servis), table libérée.
 */
async function settleBill(tx: Tx, target: BillTarget, bill: Awaited<ReturnType<typeof loadBill>>) {
  const now = new Date();
  const orderIds = bill.orders.map((o) => o.id);
  await tx.$executeRaw`UPDATE "OrderItem" SET "paidQuantity" = quantity WHERE "orderId" IN (${Prisma.join(orderIds)})`;
  await tx.order.updateMany({ where: { id: { in: orderIds } }, data: { paidAt: now } });
  await tx.order.updateMany({
    where: { id: { in: orderIds }, status: { in: ["READY", "SERVED"] } },
    data: { status: "PAID" },
  });
  await tx.order.updateMany({ where: { id: { in: orderIds }, servedAt: null, status: "PAID" }, data: { servedAt: now } });

  const updatedOrders = await tx.order.findMany({ where: { id: { in: orderIds } }, include: orderInclude });
  let tableReleased: PayResult["tableReleased"] = null;
  if (target.tableId) {
    const stillOpen = await tx.order.count({
      where: { tableId: target.tableId, status: { notIn: ["PAID", "CANCELLED"] } },
    });
    if (stillOpen === 0) {
      const table = await tx.table.update({ where: { id: target.tableId }, data: { status: "FREE" } });
      tableReleased = { id: table.id, number: table.number, status: "FREE" };
    }
  }
  return { updatedOrders, tableReleased };
}

export async function recordPayment(raw: unknown, actor: Actor): Promise<PayResult> {
  const cashierId = actor.id;
  const input = payInputSchema.parse(raw);
  const target: BillTarget = input.tableId ? { tableId: input.tableId } : { orderId: input.orderId! };

  return prisma.$transaction(
    async (tx) => {
      await lockTarget(tx, target);

      const bill = await loadBill(tx, target);
      if (!bill.orders.length) throw new HttpError(409, "Rien à encaisser : l'addition est peut-être déjà soldée");
      if (bill.totals.remaining === 0) throw new HttpError(409, "Cette addition est déjà soldée");

      // --- Montant imputé ---------------------------------------------------
      let amount: number;
      let paidItems: { orderItemId: string; quantity: number; amount: number }[] = [];

      if (input.items) {
        const byId = new Map(bill.orders.flatMap((o) => o.items).map((i) => [i.id, i]));
        const merged = new Map<string, number>();
        input.items.forEach((i) => merged.set(i.orderItemId, (merged.get(i.orderItemId) ?? 0) + i.quantity));
        paidItems = [...merged].map(([orderItemId, quantity]) => {
          const item = byId.get(orderItemId);
          if (!item) throw new HttpError(400, "Article absent de cette addition");
          if (quantity > item.quantity - item.paidQuantity) {
            throw new HttpError(409, `« ${item.name} » : quantité supérieure au reste à payer`);
          }
          return { orderItemId, quantity, amount: quantity * item.unitPrice };
        });
        amount = paidItems.reduce((s, i) => s + i.amount, 0);
      } else {
        amount = input.amount!;
      }

      if (amount > bill.totals.remaining) {
        throw new HttpError(
          409,
          `Montant supérieur au solde restant (${bill.totals.remaining} ${restaurantInfo.currency})`,
        );
      }

      // --- Espèces : rendu de monnaie -------------------------------------
      let amountReceived = amount;
      let changeReturned = 0;
      if (input.mode === "CASH") {
        amountReceived = input.amountReceived ?? amount;
        if (amountReceived < amount) throw new HttpError(400, "Montant remis insuffisant");
        changeReturned = amountReceived - amount;
      }

      const payment = await tx.payment.create({
        data: {
          tableId: target.tableId ?? null,
          cashierId,
          amount,
          mode: input.mode,
          amountReceived,
          changeReturned,
          reference: input.reference || null,
          label: input.label || (paidItems.length ? "Articles" : null),
          orders: { connect: bill.orders.map((o) => ({ id: o.id })) },
          items: { create: paidItems },
        },
        include: paymentInclude,
      });

      for (const i of paidItems) {
        await tx.orderItem.update({ where: { id: i.orderItemId }, data: { paidQuantity: { increment: i.quantity } } });
      }

      const remaining = bill.totals.remaining - amount;
      const result: PayResult = {
        payment,
        remaining,
        closed: remaining === 0,
        tableId: target.tableId ?? null,
        orderIds: bill.orders.map((o) => o.id),
        updatedOrders: [],
        tableReleased: null,
      };
      if (remaining > 0) return result;

      // --- Addition soldée : clôture --------------------------------------
      Object.assign(result, await settleBill(tx, target, bill));
      return result;
    },
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Remises
// ---------------------------------------------------------------------------

export const discountInputSchema = z
  .object({
    tableId: idSchema.optional(),
    orderId: idSchema.optional(),
    kind: z.enum(["PERCENT", "AMOUNT"]),
    value: z.number().int().positive(),
    reason: z.string().trim().min(3, "Motif obligatoire (3 caractères minimum)").max(120),
  })
  .strict()
  .refine((d) => Boolean(d.tableId) !== Boolean(d.orderId), { message: "Indiquez soit une table, soit un bon à emporter" })
  .refine((d) => d.kind !== "PERCENT" || d.value <= 100, { message: "Pourcentage entre 1 et 100", path: ["value"] });

export interface DiscountResult extends BillChange {
  discount: { id: string; amount: number; reason: string };
}

/**
 * Remise sur une addition. Anti-fraude :
 *  - motif obligatoire, auteur et IP tracés dans AuditLog (même transaction) ;
 *  - un caissier ne peut pas dépasser MAX_CASHIER_DISCOUNT_PCT % cumulés de
 *    l'addition (au-delà : seul un gérant peut l'accorder) ;
 *  - la remise ne peut pas dépasser le solde restant.
 */
export async function applyDiscount(raw: unknown, actor: Actor): Promise<DiscountResult> {
  const input = discountInputSchema.parse(raw);
  const target: BillTarget = input.tableId ? { tableId: input.tableId } : { orderId: input.orderId! };

  return prisma.$transaction(
    async (tx) => {
      await lockTarget(tx, target);
      const bill = await loadBill(tx, target);
      if (!bill.orders.length || bill.totals.remaining === 0) throw new HttpError(409, "Aucune addition ouverte à remiser");

      const amount = input.kind === "PERCENT" ? Math.round((bill.totals.total * input.value) / 100) : input.value;
      if (amount < 1) throw new HttpError(400, "Remise nulle");
      if (amount > bill.totals.remaining) {
        throw new HttpError(409, `La remise dépasse le solde restant (${bill.totals.remaining} ${restaurantInfo.currency})`);
      }
      const cumulatedPct = ((bill.totals.discounted + amount) / bill.totals.total) * 100;
      if (actor.role !== "ADMIN" && cumulatedPct > env.maxCashierDiscountPct + 1e-9) {
        throw new HttpError(
          403,
          `Remise cumulée de ${cumulatedPct.toFixed(1)} % : au-delà de ${env.maxCashierDiscountPct} %, l'accord d'un gérant est requis`,
        );
      }

      const discount = await tx.discount.create({
        data: {
          tableId: target.tableId ?? null,
          cashierId: actor.id,
          kind: input.kind,
          value: input.value,
          amount,
          reason: input.reason,
          orders: { connect: bill.orders.map((o) => ({ id: o.id })) },
        },
      });
      await audit(tx, actor, "DISCOUNT_APPLIED", {
        discountId: discount.id,
        table: bill.orders[0]?.table?.number ?? null,
        orderNumbers: bill.orders.map((o) => o.number),
        kind: input.kind,
        value: input.value,
        amount,
        billTotal: bill.totals.total,
        cumulatedPct: Math.round(cumulatedPct * 10) / 10,
        reason: input.reason,
      });

      const remaining = bill.totals.remaining - amount;
      const result: DiscountResult = {
        discount: { id: discount.id, amount, reason: discount.reason },
        remaining,
        closed: remaining === 0,
        tableId: target.tableId ?? null,
        orderIds: bill.orders.map((o) => o.id),
        updatedOrders: [],
        tableReleased: null,
      };
      if (remaining === 0) Object.assign(result, await settleBill(tx, target, bill));
      return result;
    },
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Ticket de caisse
// ---------------------------------------------------------------------------

export async function getReceipt(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      ...paymentInclude,
      table: { select: { number: true } },
      orders: { include: { items: { orderBy: { id: "asc" } }, server: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!payment) throw new HttpError(404, "Paiement introuvable");

  const orderIds = payment.orders.map((o) => o.id);
  const history = await prisma.payment.findMany({
    where: { orders: { some: { id: { in: orderIds } } }, number: { lte: payment.number } },
    select: { id: true, number: true, mode: true, amount: true, label: true, createdAt: true },
    orderBy: { number: "asc" },
  });

  const discounts = await prisma.discount.findMany({
    where: { orders: { some: { id: { in: orderIds } } }, createdAt: { lte: payment.createdAt } },
    select: { amount: true, reason: true, kind: true, value: true },
    orderBy: { createdAt: "asc" },
  });

  const total = payment.orders.reduce((s, o) => s + o.totalAmount, 0);
  const discounted = discounts.reduce((s, d) => s + d.amount, 0);
  const paidBefore = history.filter((h) => h.id !== payment.id).reduce((s, h) => s + h.amount, 0);
  const first = payment.orders[0];

  return {
    restaurant: restaurantInfo,
    ticketNumber: payment.number,
    createdAt: payment.createdAt,
    cashier: payment.cashier.name,
    servers: [...new Set(payment.orders.map((o) => o.server.name))],
    table: payment.table?.number ?? null,
    orderType: first?.type ?? "DINE_IN",
    orderNumbers: payment.orders.map((o) => o.number),
    lines: payment.orders.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
        modifiers: i.modifiers,
      })),
    ),
    /** Articles réglés par ce versement (paiement par sélection d'articles). */
    paidLines: payment.items.map((i) => ({ name: i.orderItem.name, quantity: i.quantity, amount: i.amount })),
    payment: {
      mode: payment.mode,
      label: payment.label,
      amount: payment.amount,
      amountReceived: payment.amountReceived,
      changeReturned: payment.changeReturned,
      reference: payment.reference,
    },
    discounts: discounts.map((d) => ({ reason: d.reason, amount: d.amount, label: d.kind === "PERCENT" ? `${d.value} %` : null })),
    history: history.map((h) => ({ number: h.number, mode: h.mode, amount: h.amount, label: h.label, createdAt: h.createdAt })),
    totals: {
      total,
      paidBefore,
      paidNow: payment.amount,
      discounted,
      remainingAfter: Math.max(0, total - discounted - paidBefore - payment.amount),
    },
  };
}
