import { PrismaClient, Role, Station } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Comptes de démonstration : identifiant + PIN (à changer avant toute mise en service)
const users: { name: string; username: string; role: Role; pin: string }[] = [
  { name: "Admin", username: "admin", role: "ADMIN", pin: "0000" },
  { name: "Awa (serveuse)", username: "awa", role: "SERVEUR", pin: "1111" },
  { name: "Issa (serveur)", username: "issa", role: "SERVEUR", pin: "2222" },
  { name: "Cuisine", username: "cuisine", role: "CUISINE", pin: "3333" },
  { name: "Caisse", username: "caisse", role: "CAISSE", pin: "4444" },
];

type L = { fr: string; en: string };
const l = (fr: string, en: string): L => ({ fr, en });
const COOKING = [l("Bleu", "Blue rare"), l("Saignant", "Rare"), l("À point", "Medium"), l("Bien cuit", "Well done")];

// Carte bilingue : [français, anglais] pour chaque libellé
const menu: {
  name: L;
  station: Station;
  items: { name: L; price: number; description?: L; options?: object }[];
}[] = [
  {
    name: l("Entrées", "Starters"),
    station: "KITCHEN",
    items: [
      { name: l("Salade composée", "Mixed salad"), price: 2500, description: l("Laitue, tomate, avocat, œuf", "Lettuce, tomato, avocado, egg") },
      { name: l("Alloco", "Alloco (fried plantain)"), price: 1500, description: l("Bananes plantain frites, sauce pimentée", "Fried plantain, spicy sauce") },
      { name: l("Nems (x4)", "Spring rolls (x4)"), price: 2000 },
    ],
  },
  {
    name: l("Plats", "Main courses"),
    station: "KITCHEN",
    items: [
      {
        name: l("Poulet braisé", "Grilled chicken"),
        price: 5000,
        description: l("Demi-poulet, attiéké ou frites", "Half chicken, attiéké or fries"),
        options: {
          sides: [l("Attiéké", "Attiéké (cassava couscous)"), l("Frites", "Fries"), l("Riz", "Rice")],
          extras: [
            { ...l("Sauce piment", "Chili sauce"), price: 0 },
            { ...l("Oignons frits", "Fried onions"), price: 300 },
          ],
        },
      },
      {
        name: l("Entrecôte grillée", "Grilled rib steak"),
        price: 8500,
        options: {
          cooking: COOKING,
          sides: [l("Frites", "Fries"), l("Légumes sautés", "Sautéed vegetables")],
          extras: [
            { ...l("Sauce poivre", "Pepper sauce"), price: 500 },
            { ...l("Œuf au plat", "Fried egg"), price: 500 },
          ],
        },
      },
      {
        name: l("Capitaine braisé", "Grilled Nile perch"),
        price: 7000,
        options: { sides: [l("Attiéké", "Attiéké (cassava couscous)"), l("Alloco", "Fried plantain")] },
      },
      { name: l("Riz sauce arachide", "Rice with peanut sauce"), price: 3500 },
      { name: l("Tô sauce gombo", "Tô with okra sauce"), price: 2500 },
      {
        name: l("Burger maison", "House burger"),
        price: 4500,
        options: {
          cooking: COOKING.slice(1),
          extras: [
            { ...l("Cheddar", "Cheddar"), price: 500 },
            { ...l("Bacon", "Bacon"), price: 700 },
          ],
        },
      },
    ],
  },
  {
    name: l("Desserts", "Desserts"),
    station: "KITCHEN",
    items: [
      { name: l("Salade de fruits", "Fruit salad"), price: 1500 },
      { name: l("Fondant au chocolat", "Chocolate fondant"), price: 2500 },
      { name: l("Dégué", "Dégué (millet yogurt)"), price: 1000 },
    ],
  },
  {
    name: l("Boissons", "Drinks"),
    station: "BAR",
    items: [
      { name: l("Bissap", "Bissap (hibiscus juice)"), price: 700 },
      { name: l("Jus de gingembre", "Ginger juice"), price: 700 },
      { name: l("Eau minérale 1,5 L", "Mineral water 1.5 L"), price: 600 },
      { name: l("Coca-Cola", "Coca-Cola"), price: 800, options: { extras: [{ ...l("Glaçons", "Ice"), price: 0 }] } },
      { name: l("Brakina", "Brakina (local beer)"), price: 1000 },
      { name: l("Café", "Coffee"), price: 500, options: { extras: [{ ...l("Lait", "Milk"), price: 100 }] } },
    ],
  },
];

async function main() {
  // Le journal d'audit est en ajout seul (trigger) : seule une réinitialisation complète (TRUNCATE) est possible
  await prisma.$executeRawUnsafe('TRUNCATE "AuditLog"');
  // Ordre de suppression compatible avec les clés étrangères
  await prisma.review.deleteMany();
  await prisma.authSession.deleteMany();
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
      data: { name: u.name, username: u.username, role: u.role, pinHash: await bcrypt.hash(u.pin, 12) },
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
        nameFr: cat.name.fr,
        nameEn: cat.name.en,
        order: index,
        station: cat.station,
        items: {
          create: cat.items.map((i) => ({
            nameFr: i.name.fr,
            nameEn: i.name.en,
            descriptionFr: i.description?.fr,
            descriptionEn: i.description?.en,
            price: i.price,
            options: i.options,
          })),
        },
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
