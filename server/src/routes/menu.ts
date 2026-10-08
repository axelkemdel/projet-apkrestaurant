import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { listMenu } from "../services/publicPortal.js";

export const menuRouter = Router();

/** Carte des serveurs : plats masqués exclus, plats en rupture renvoyés (affichés « Épuisé »). */
menuRouter.get("/", requireAuth(), async (_req, res) => {
  res.json(await listMenu());
});
