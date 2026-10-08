import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";

export const menuRouter = Router();

/** Carte des serveurs : plats masqués exclus, plats en rupture renvoyés (affichés « Épuisé »). */
menuRouter.get("/", requireAuth(), async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { items: { where: { isArchived: false }, orderBy: { name: "asc" } } },
  });
  res.json(categories);
});
