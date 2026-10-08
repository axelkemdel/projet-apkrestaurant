import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { HttpError } from "../lib/errors.js";
import { restaurantInfo } from "../lib/restaurant.js";
import { normalizeOptions } from "../lib/menuOptions.js";
import { createOrder, orderInclude, orderLineSchema, type OrderWithRelations } from "./orders.js";

/**
 * Portail client par QR code. Chaque table porte un jeton secret (UUID v4, 122 bits
 * aléatoires) : le numéro seul serait devinable et permettrait de commander « à la
 * table 5 » depuis l'extérieur. Le gérant peut régénérer le jeton (ancien QR invalidé).
 *
 * Le client n'est jamais authentifié : il ne voit que sa table (bons ouverts), la
 * carte, et ne peut qu'ajouter des bons, appeler le serveur, demander l'addition et noter.
 */

export const qrTokenSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "portal.invalidQr");

/** Statuts encore visibles par le client (la table est « en session »). */
const OPEN: Prisma.EnumOrderStatusFilter = { notIn: ["PAID", "CANCELLED"] };
/** Fenêtre pendant laquelle un client peut noter un bon de sa table. */
const REVIEW_WINDOW_MS = 12 * 3600_000;
/** Une nouvelle demande identique moins d'une minute après la précédente n'est pas renotifiée. */
const REQUEST_COOLDOWN_MS = 60_000;

export async function tableByToken(token: unknown) {
  const parsed = qrTokenSchema.safeParse(token);
  if (!parsed.success) throw new HttpError(404, "portal.invalidQr");
  const table = await prisma.table.findUnique({ where: { qrToken: parsed.data.toLowerCase() } });
  if (!table) throw new HttpError(404, "portal.invalidQr");
  return table;
}

// ---------------------------------------------------------------------------
// Vue client d'un bon : ni serveur, ni paiements, ni identifiants internes inutiles
// ---------------------------------------------------------------------------

export function toPublicOrder(o: OrderWithRelations) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    source: o.source,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt,
    startedAt: o.startedAt,
    readyAt: o.readyAt,
    servedAt: o.servedAt,
    items: o.items.map((i) => ({
      id: i.id,
      nameFr: i.nameFr,
      nameEn: i.nameEn,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      modifiers: i.modifiers,
      quickNotes: i.quickNotes,
      notes: i.notes,
    })),
  };
}
export type PublicOrder = ReturnType<typeof toPublicOrder>;

export function toPublicTable(t: { number: number; zone: string; status: string; callRequestedAt: Date | null; billRequestedAt: Date | null }) {
  return { number: t.number, zone: t.zone, status: t.status, callRequestedAt: t.callRequestedAt, billRequestedAt: t.billRequestedAt };
}

/** Carte visible (plats masqués exclus, ruptures renvoyées « Épuisé »), options bilingues. */
export async function listMenu() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { items: { where: { isArchived: false }, orderBy: { nameFr: "asc" } } },
  });
  return categories.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, options: normalizeOptions(i.options) })) }));
}

export async function getPortal(token: unknown) {
  const table = await tableByToken(token);
  const [menu, orders] = await Promise.all([
    listMenu(),
    prisma.order.findMany({ where: { tableId: table.id, status: OPEN }, include: orderInclude, orderBy: { createdAt: "asc" } }),
  ]);
  const reviewed = await prisma.review.findMany({
    where: { orderId: { in: orders.map((o) => o.id) } },
    select: { orderId: true },
  });
  return {
    restaurant: { name: restaurantInfo.name, currency: restaurantInfo.currency },
    ordering: env.publicOrdering,
    table: toPublicTable(table),
    menu: menu.filter((c) => c.items.length > 0),
    orders: orders.map(toPublicOrder),
    reviewedOrderIds: reviewed.map((r) => r.orderId),
  };
}

// ---------------------------------------------------------------------------
// Commande client
// ---------------------------------------------------------------------------

/** Limites plus strictes que pour le personnel : un client commande pour sa table seulement. */
export const publicOrderSchema = z
  .object({
    token: qrTokenSchema,
    language: z.enum(["FR", "EN"]).default("FR"),
    customerNote: z.string().max(300).optional(),
    items: z
      .array(orderLineSchema.extend({ quantity: z.number().int().min(1).max(20) }))
      .min(1, "validation.emptyOrder")
      .max(30),
  })
  .strict();

export async function createCustomerOrder(raw: unknown) {
  if (!env.publicOrdering) throw new HttpError(403, "portal.orderingDisabled");
  const input = publicOrderSchema.parse(raw);
  const table = await tableByToken(input.token);
  // Prix, disponibilité et options revérifiés côté serveur par createOrder
  return createOrder(
    { type: "DINE_IN", tableId: table.id, language: input.language, customerNote: input.customerNote, items: input.items },
    null,
    "CUSTOMER",
  );
}

// ---------------------------------------------------------------------------
// Appel du serveur / demande d'addition
// ---------------------------------------------------------------------------

export type AssistanceKind = "CALL" | "BILL";

export async function requestAssistance(token: unknown, kind: AssistanceKind) {
  const table = await tableByToken(token);
  if (kind === "BILL") {
    const open = await prisma.order.count({ where: { tableId: table.id, status: OPEN } });
    if (open === 0) throw new HttpError(409, "portal.noOpenBill");
  }
  const field = kind === "CALL" ? "callRequestedAt" : "billRequestedAt";
  const now = new Date();
  // Mise à jour conditionnelle : un client qui tapote dix fois n'envoie qu'une alerte par minute
  const { count } = await prisma.table.updateMany({
    where: { id: table.id, OR: [{ [field]: null }, { [field]: { lt: new Date(now.getTime() - REQUEST_COOLDOWN_MS) } }] },
    data: { [field]: now },
  });
  const updated = await prisma.table.findUniqueOrThrow({ where: { id: table.id } });
  return { table: updated, notified: count > 0 };
}

/** Le personnel a pris en compte la demande (ou s'est déplacé) : on l'efface. */
export async function clearAssistance(tableId: string, kind?: AssistanceKind) {
  const data = {
    ...(kind !== "BILL" && { callRequestedAt: null }),
    ...(kind !== "CALL" && { billRequestedAt: null }),
  };
  const table = await prisma.table.findUnique({ where: { id: tableId } });
  if (!table) throw new HttpError(404, "table.notFound");
  return prisma.table.update({ where: { id: tableId }, data });
}

// ---------------------------------------------------------------------------
// Avis client
// ---------------------------------------------------------------------------

export const reviewSchema = z
  .object({
    token: qrTokenSchema,
    orderId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
    language: z.enum(["FR", "EN"]).default("FR"),
  })
  .strict();

export async function createReview(raw: unknown) {
  const input = reviewSchema.parse(raw);
  const table = await tableByToken(input.token);
  // Un avis porte sur un bon réel et récent de cette table : pas d'avis « dans le vide »
  const recent = { tableId: table.id, status: { not: "CANCELLED" as const }, createdAt: { gte: new Date(Date.now() - REVIEW_WINDOW_MS) } };
  const order = input.orderId
    ? await prisma.order.findFirst({ where: { id: input.orderId, ...recent } })
    : await prisma.order.findFirst({ where: recent, orderBy: { createdAt: "desc" } });
  if (!order) throw new HttpError(input.orderId ? 404 : 409, input.orderId ? "portal.orderNotFound" : "portal.nothingToReview");
  try {
    return await prisma.review.create({
      data: { tableId: table.id, orderId: order.id, rating: input.rating, comment: input.comment || null, language: input.language },
      select: { id: true, rating: true, orderId: true, createdAt: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "portal.alreadyReviewed");
    throw e;
  }
}
