import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/errors.js";
import { getCheckoutOverview } from "./checkout.js";

/**
 * Fuseau horaire du restaurant : les dates sont stockées en UTC, mais « la
 * journée » et « 19 h » s'entendent en heure locale (Ouagadougou = UTC+0,
 * Douala / Libreville = UTC+1…).
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Ouagadougou";
try {
  new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIMEZONE });
} catch {
  throw new Error(`APP_TIMEZONE invalide : ${APP_TIMEZONE}`);
}

/** Expression SQL : horodatage converti en heure locale du restaurant. */
const local = (column: string, alias?: string) =>
  Prisma.raw(`((${alias ? `"${alias}".` : ""}"${column}" AT TIME ZONE 'UTC') AT TIME ZONE '${APP_TIMEZONE.replace(/'/g, "")}')`);

export function todayLocal(): string {
  // en-CA formate en AAAA-MM-JJ
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((d) => !Number.isNaN(Date.parse(d)), "Date invalide");

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

// ---------------------------------------------------------------------------
// Journée : KPI, ventilation des paiements, heures de pointe
// ---------------------------------------------------------------------------

export async function getDailyStats(query: { date?: unknown }) {
  const date = query.date === undefined || query.date === "" ? todayLocal() : dateSchema.parse(query.date);

  const isToday = date === todayLocal();

  const [revenueByDay, byMode, hourlyRevenue, hourlyOrders, orderCounts, bills, overview, sameTime] = await Promise.all([
    // CA encaissé du jour et de la veille (comparaison)
    prisma.$queryRaw<{ day: Date; amount: bigint; count: bigint }[]>`
      SELECT (${local("createdAt")})::date AS day, SUM(amount)::bigint AS amount, COUNT(*)::bigint AS count
      FROM "Payment"
      WHERE (${local("createdAt")})::date IN (${date}::date, ${date}::date - 1)
      GROUP BY 1`,
    prisma.$queryRaw<{ mode: string; amount: bigint; count: bigint }[]>`
      SELECT mode::text AS mode, SUM(amount)::bigint AS amount, COUNT(*)::bigint AS count
      FROM "Payment"
      WHERE (${local("createdAt")})::date = ${date}::date
      GROUP BY 1`,
    prisma.$queryRaw<{ hour: number; amount: bigint }[]>`
      SELECT EXTRACT(HOUR FROM ${local("createdAt")})::int AS hour, SUM(amount)::bigint AS amount
      FROM "Payment"
      WHERE (${local("createdAt")})::date = ${date}::date
      GROUP BY 1`,
    prisma.$queryRaw<{ hour: number; orders: bigint; items: bigint }[]>`
      SELECT EXTRACT(HOUR FROM ${local("createdAt", "o")})::int AS hour,
             COUNT(DISTINCT o.id)::bigint AS orders,
             COALESCE(SUM(oi.quantity), 0)::bigint AS items
      FROM "Order" o LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE (${local("createdAt", "o")})::date = ${date}::date AND o.status <> 'CANCELLED'
      GROUP BY 1`,
    prisma.$queryRaw<{ created: bigint; served: bigint; cancelled: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE (${local("createdAt")})::date = ${date}::date AND status <> 'CANCELLED')::bigint AS created,
        COUNT(*) FILTER (WHERE "servedAt" IS NOT NULL AND (${local("servedAt")})::date = ${date}::date)::bigint AS served,
        COUNT(*) FILTER (WHERE (${local("createdAt")})::date = ${date}::date AND status = 'CANCELLED')::bigint AS cancelled
      FROM "Order"`,
    // Additions soldées ce jour : une addition = les bons d'une même table soldés ensemble
    // (même paidAt), ou un bon à emporter.
    prisma.$queryRaw<{ dineIn: bigint; takeaway: bigint; amount: bigint }[]>`
      SELECT
        COUNT(DISTINCT ("tableId", "paidAt")) FILTER (WHERE "tableId" IS NOT NULL)::bigint AS "dineIn",
        COUNT(*) FILTER (WHERE "tableId" IS NULL)::bigint AS takeaway,
        COALESCE(SUM("totalAmount"), 0)::bigint AS amount
      FROM "Order"
      WHERE "paidAt" IS NOT NULL AND (${local("paidAt")})::date = ${date}::date AND status <> 'CANCELLED'`,
    getCheckoutOverview(),
    // Journée en cours : on compare à la veille arrêtée à la même heure (sinon « −100 % » à l'ouverture)
    isToday
      ? prisma.$queryRaw<{ amount: bigint }[]>`
          SELECT COALESCE(SUM(amount), 0)::bigint AS amount
          FROM "Payment"
          WHERE (${local("createdAt")})::date = ${date}::date - 1
            AND (${local("createdAt")})::time <= (now() AT TIME ZONE ${APP_TIMEZONE})::time`
      : Promise.resolve(null),
  ]);

  const revenueOf = (offset: number) => {
    const target = new Date(`${date}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() - offset);
    const key = target.toISOString().slice(0, 10);
    return num(revenueByDay.find((r) => r.day.toISOString().slice(0, 10) === key)?.amount);
  };
  const revenue = revenueOf(0);
  const previousDay = revenueOf(1);
  const previous = sameTime ? num(sameTime[0]?.amount) : previousDay;

  const billCount = num(bills[0]?.dineIn) + num(bills[0]?.takeaway);
  const outstanding =
    overview.tables.reduce((s, t) => s + t.bill.remaining, 0) + overview.takeaway.reduce((s, t) => s + t.bill.remaining, 0);

  const modes = ["CASH", "CARD", "ORANGE_MONEY", "TELECEL_CASH"] as const;

  return {
    date,
    timezone: APP_TIMEZONE,
    revenue: {
      today: revenue,
      previousDay,
      /** Base de comparaison : veille à la même heure (aujourd'hui) ou veille complète (jour passé). */
      comparedTo: previous,
      comparison: sameTime ? ("same_time_yesterday" as const) : ("previous_day" as const),
      // null quand la base est à 0 : une variation en % n'a pas de sens
      changePct: previous > 0 ? Math.round(((revenue - previous) / previous) * 1000) / 10 : null,
      payments: num(revenueByDay.find((r) => r.day.toISOString().slice(0, 10) === date)?.count),
    },
    orders: {
      created: num(orderCounts[0]?.created),
      served: num(orderCounts[0]?.served),
      cancelled: num(orderCounts[0]?.cancelled),
    },
    bills: {
      settled: billCount,
      dineIn: num(bills[0]?.dineIn),
      takeaway: num(bills[0]?.takeaway),
      averageAmount: billCount ? Math.round(num(bills[0]?.amount) / billCount) : 0,
    },
    outstanding,
    paymentsByMode: modes.map((mode) => {
      const row = byMode.find((r) => r.mode === mode);
      return { mode, amount: num(row?.amount), count: num(row?.count) };
    }),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: num(hourlyRevenue.find((r) => r.hour === hour)?.amount),
      orders: num(hourlyOrders.find((r) => r.hour === hour)?.orders),
      items: num(hourlyOrders.find((r) => r.hour === hour)?.items),
    })),
  };
}

// ---------------------------------------------------------------------------
// Plats stars
// ---------------------------------------------------------------------------

const PERIOD_DAYS = { day: 1, week: 7, month: 30 } as const;

export async function getTopItems(query: { date?: unknown; period?: unknown; limit?: unknown }) {
  const date = query.date === undefined || query.date === "" ? todayLocal() : dateSchema.parse(query.date);
  const period = z.enum(["day", "week", "month"]).default("day").parse(query.period || undefined);
  const limit = z.coerce.number().int().min(1).max(50).default(20).parse(query.limit || undefined);
  if (!PERIOD_DAYS[period]) throw new HttpError(400, "Période invalide");
  const days = PERIOD_DAYS[period] - 1;

  const rows = await prisma.$queryRaw<
    { menuItemId: string; name: string; station: string; quantity: bigint; revenue: bigint; orders: bigint }[]
  >`
    SELECT oi."menuItemId", mi.name, c.station::text AS station,
           SUM(oi.quantity)::bigint AS quantity,
           SUM(oi.quantity * oi."unitPrice")::bigint AS revenue,
           COUNT(DISTINCT oi."orderId")::bigint AS orders
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "MenuItem" mi ON mi.id = oi."menuItemId"
    JOIN "Category" c ON c.id = mi."categoryId"
    WHERE o.status <> 'CANCELLED'
      AND (${local("createdAt", "o")})::date BETWEEN ${date}::date - ${days}::int AND ${date}::date
    GROUP BY oi."menuItemId", mi.name, c.station`;

  const items = rows.map((r) => ({
    menuItemId: r.menuItemId,
    name: r.name,
    station: r.station as "KITCHEN" | "BAR",
    quantity: num(r.quantity),
    revenue: num(r.revenue),
    orders: num(r.orders),
  }));

  return {
    date,
    period,
    byQuantity: [...items].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, limit),
    byRevenue: [...items].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, limit),
  };
}
