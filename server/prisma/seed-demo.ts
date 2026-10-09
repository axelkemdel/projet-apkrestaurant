/**
 * Historique de démonstration pour le tableau de bord : 30 jours de ventes
 * (additions soldées, paiements ventilés, pics à midi et le soir).
 * À lancer APRÈS `prisma db seed`. Les heures sont générées en UTC
 * (= heure locale pour APP_TIMEZONE="Africa/Ouagadougou").
 *
 *   npm run db:seed:demo
 */
import { PrismaClient, type PaymentMode } from "@prisma/client";

const prisma = new PrismaClient();

// Générateur pseudo-aléatoire déterministe : mêmes données à chaque exécution
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// Poids horaires : petit-déjeuner léger, rush du midi, rush du soir
const HOUR_WEIGHTS: Record<number, number> = { 8: 1, 9: 1, 10: 1, 11: 3, 12: 9, 13: 10, 14: 5, 15: 2, 16: 2, 17: 3, 18: 5, 19: 9, 20: 11, 21: 8, 22: 4 };
const HOURS = Object.entries(HOUR_WEIGHTS).flatMap(([h, w]) => Array(w).fill(Number(h)) as number[]);
const MODES: PaymentMode[] = ["CASH", "CASH", "CASH", "CASH", "ORANGE_MONEY", "ORANGE_MONEY", "ORANGE_MONEY", "CARD", "TELECEL_CASH", "TELECEL_CASH"];

async function main() {
  // Ventes fictives : jamais dans une base de production
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Historique de démonstration refusé en production.");
  }
  const [items, tables, servers, cashier] = await Promise.all([
    prisma.menuItem.findMany({ where: { isArchived: false }, include: { category: true } }),
    prisma.table.findMany(),
    prisma.user.findMany({ where: { role: "SERVEUR" } }),
    prisma.user.findFirst({ where: { role: "CAISSE" } }),
  ]);
  if (!items.length || !servers.length || !cashier) throw new Error("Lancez d'abord `npm run db:seed`");

  // Popularité inégale : quelques plats stars
  const dishes = items.filter((i) => i.category.station === "KITCHEN");
  const drinks = items.filter((i) => i.category.station === "BAR");
  const weighted = <T extends { nameFr: string }>(list: T[]) =>
    list.flatMap((i, idx) => Array(Math.max(1, list.length - idx + (/Poulet|Bissap|Brakina|Alloco/.test(i.nameFr) ? 6 : 0))).fill(i) as T[]);
  const dishPool = weighted(dishes);
  const drinkPool = weighted(drinks);

  const now = new Date();
  let bills = 0;

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    const weekday = day.getUTCDay();
    const count = between(14, 22) + (weekday === 5 || weekday === 6 ? 10 : 0); // vendredi / samedi plus chargés

    for (let n = 0; n < count; n++) {
      const hour = pick(HOURS);
      const createdAt = new Date(day.getTime() + hour * 3_600_000 + between(0, 50) * 60_000);
      if (createdAt > now) continue; // pas de ventes dans le futur

      const takeaway = rand() < 0.2;
      const guests = takeaway ? 1 : between(1, 5);
      const lines = new Map<string, { item: (typeof items)[number]; quantity: number }>();
      const add = (item: (typeof items)[number]) => {
        const l = lines.get(item.id);
        if (l) l.quantity++;
        else lines.set(item.id, { item, quantity: 1 });
      };
      for (let g = 0; g < guests; g++) {
        if (hour >= 11 || rand() < 0.3) add(pick(dishPool));
        add(pick(drinkPool));
        if (rand() < 0.25) add(pick(drinkPool));
      }

      const servedAt = new Date(createdAt.getTime() + between(10, 30) * 60_000);
      const paidAt = new Date(servedAt.getTime() + between(10, 60) * 60_000);
      if (paidAt > now) continue;

      const data = [...lines.values()].map((l) => ({
        menuItemId: l.item.id,
        nameFr: l.item.nameFr,
        nameEn: l.item.nameEn,
        quantity: l.quantity,
        paidQuantity: l.quantity,
        unitPrice: l.item.price,
        station: l.item.category.station,
      }));
      const total = data.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

      const order = await prisma.order.create({
        data: {
          type: takeaway ? "TAKEAWAY" : "DINE_IN",
          language: rand() < 0.17 ? "EN" : "FR",
          tableId: takeaway ? null : pick(tables).id,
          serverId: pick(servers).id,
          status: "PAID",
          totalAmount: total,
          createdAt,
          startedAt: new Date(createdAt.getTime() + 3 * 60_000),
          readyAt: new Date(servedAt.getTime() - 2 * 60_000),
          servedAt,
          paidAt,
          items: { create: data },
        },
      });

      // Une addition sur cinq est partagée en deux versements
      const split = !takeaway && total >= 4000 && rand() < 0.2;
      const parts = split ? [Math.ceil(total / 2), total - Math.ceil(total / 2)] : [total];
      for (const [i, amount] of parts.entries()) {
        const mode = pick(MODES);
        const received = mode === "CASH" ? Math.ceil(amount / 1000) * 1000 + (rand() < 0.3 ? 5000 : 0) : amount;
        await prisma.payment.create({
          data: {
            tableId: order.tableId,
            cashierId: cashier.id,
            amount,
            mode,
            amountReceived: received,
            changeReturned: received - amount,
            label: split ? `Part ${i + 1}/2` : null,
            createdAt: new Date(paidAt.getTime() + i * 60_000),
            orders: { connect: { id: order.id } },
          },
        });
      }
      bills++;
    }
  }
  console.log(`Historique de démo : ${bills} additions soldées sur 30 jours.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
