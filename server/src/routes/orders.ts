import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { createOrder, listActiveOrders, updateOrderStatus } from "../services/orders.js";
import { broadcastNewOrder, broadcastOrderUpdated } from "../realtime.js";

export const ordersRouter = Router();

/** Bons en cours (PENDING / PREPARING / READY) — chargement initial du KDS. */
ordersRouter.get("/active", requireAuth(), async (_req, res) => {
  res.json(await listActiveOrders());
});

/** Équivalent REST de l'événement socket `new_order` (utile pour intégrations / tests). */
ordersRouter.post("/", requireAuth("SERVEUR", "CAISSE"), async (req, res) => {
  const order = await createOrder(req.body, req.user!.id);
  broadcastNewOrder(order);
  res.status(201).json(order);
});

ordersRouter.patch("/:id/status", requireAuth("CUISINE", "SERVEUR"), async (req, res) => {
  if (req.user!.role === "SERVEUR" && req.body?.status !== "SERVED") {
    res.status(403).json({ error: "Un serveur ne peut que marquer une commande comme servie" });
    return;
  }
  const order = await updateOrderStatus(String(req.params.id), req.body);
  await broadcastOrderUpdated(order);
  res.json(order);
});
