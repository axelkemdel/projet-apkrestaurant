import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";

export const menuRouter = Router();

/** Carte complète, catégories ordonnées. Les plats indisponibles sont renvoyés (affichés grisés). */
menuRouter.get("/", requireAuth(), async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { name: "asc" } } },
  });
  res.json(categories);
});
