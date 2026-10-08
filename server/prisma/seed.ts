import { PrismaClient, Role, Station } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const users: { name: string; role: Role; pin: string }[] = [
  { name: "Admin", role: "ADMIN", pin: "0000" },
  { name: "Awa (serveuse)", role: "SERVEUR", pin: "1111" },
  { name: "Issa (serveur)", role: "SERVEUR", pin: "2222" },
  { name: "Cuisine", role: "CUISINE", pin: "3333" },
  { name: "Caisse", role: "CAISSE", pin: "4444" },
];

const menu: {
  name: string;
  station: Station;
  items: { name: string; price: number; description?: string; options?: object }[];
}[] = [
  {
    name: "Entrées",
    station: "KITCHEN",
    items: [
      { name: "Salade composée", price: 2500, description: "Laitue, tomate, avocat, œuf" },
      { name: "Alloco", price: 1500, description: "Bananes plantain frites, sauce pimentée" },
      { name: "Nems (x4)", price: 2000 },
    ],
  },
  {
    name: "Plats",
    station: "KITCHEN",
    items: [
      {
        name: "Poulet braisé",
        price: 5000,
        description: "Demi-poulet, attiéké ou frites",
        options: {
          sides: ["Attiéké", "Frites", "Riz"],
          extras: [{ name: "Sauce piment", price: 0 }, { name: "Oignons frits", price: 300 }],
        },
      },
      {
        name: "Entrecôte grillée",
        price: 8500,
        options: {
          cooking: ["Bleu", "Saignant", "À point", "Bien cuit"],
          sides: ["Frites", "Légumes sautés"],
          extras: [{ name: "Sauce poivre", price: 500 }, { name: "Œuf au plat", price: 500 }],
        },
      },
      {
        name: "Capitaine braisé",
        price: 7000,
        options: { sides: ["Attiéké", "Alloco"] },
      },
      { name: "Riz sauce arachide", price: 3500 },
      { name: "Tô sauce gombo", price: 2500 },
      {
        name: "Burger maison",
        price: 4500,
        options: {
          cooking: ["Saignant", "À point", "Bien cuit"],
          extras: [{ name: "Cheddar", price: 500 }, { name: "Bacon", price: 700 }],
        },
      },
    ],
  },
  {
    name: "Desserts",
    station: "KITCHEN",
    items: [
      { name: "Salade de fruits", price: 1500 },
      { name: "Fondant au chocolat", price: 2500 },
      { name: "Dégué", price: 1000 },
    ],
  },
  {
    name: "Boissons",
    station: "BAR",
    items: [
      { name: "Bissap", price: 700 },
      { name: "Jus de gingembre", price: 700 },
      { name: "Eau minérale 1,5 L", price: 600 },
      { name: "Coca-Cola", price: 800, options: { extras: [{ name: "Glaçons", price: 0 }] } },
      { name: "Brakina", price: 1000 },
      { name: "Café", price: 500, options: { extras: [{ name: "Lait", price: 100 }] } },
    ],
  },
];

async function main() {
  // Le journal d'audit est en ajout seul (trigger) : seule une réinitialisation complète (TRUNCATE) est possible
  await prisma.$executeRawUnsafe('TRUNCATE "AuditLog"');
  // Ordre de suppression compatible avec les clés étrangères
  await prisma.discount.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();

  for (const u of users) {
    await prisma.user.create({
      data: { name: u.name, role: u.role, pinHash: await bcrypt.hash(u.pin, 10) },
    });
  }

  for (let n = 1; n <= 12; n++) {
    await prisma.table.create({
      data: { number: n, capacity: n % 3 === 0 ? 6 : n % 2 === 0 ? 4 : 2, zone: n <= 8 ? "Salle" : "Terrasse" },
    });
  }

  for (const [index, cat] of menu.entries()) {
    await prisma.category.create({
      data: {
        name: cat.name,
        order: index,
        station: cat.station,
        items: { create: cat.items },
      },
    });
  }

  console.log("Seed terminé. PINs : Admin 0000 · Serveurs 1111/2222 · Cuisine 3333 · Caisse 4444");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
