import { Router } from "express";
import { actorOf, requireAuth } from "../lib/auth.js";
import { validateIdParams } from "../lib/security.js";
import {
  applyDiscount,
  getCheckoutOverview,
  getOrderBill,
  getReceipt,
  getTableBill,
  recordPayment,
} from "../services/checkout.js";
import { broadcastBillChange, broadcastPayment } from "../realtime.js";

export const checkoutRouter = Router();
validateIdParams(checkoutRouter, "tableId", "orderId", "paymentId");

// Toutes les routes caisse : rôle CAISSE (ADMIN passe toujours)
checkoutRouter.use(requireAuth("CAISSE"));

/** Plan de salle de la caisse : solde de chaque table + bons à emporter non réglés. */
checkoutRouter.get("/overview", async (_req, res) => {
  res.json(await getCheckoutOverview());
});

/** Addition d'une table : bons ouverts, articles (quantités déjà réglées), versements, remises, totaux. */
checkoutRouter.get("/table/:tableId", async (req, res) => {
  res.json(await getTableBill(String(req.params.tableId)));
});

/** Addition d'un bon à emporter / livraison. */
checkoutRouter.get("/order/:orderId", async (req, res) => {
  res.json(await getOrderBill(String(req.params.orderId)));
});

/**
 * Enregistre un versement (complet, part égale, acompte ou sélection d'articles).
 * Si le solde tombe à 0 : bons → PAID, table → FREE, événements Socket.io diffusés.
 */
checkoutRouter.post("/pay", async (req, res) => {
  const result = await recordPayment(req.body, actorOf(req));
  broadcastPayment(result);
  res.status(201).json({
    paymentId: result.payment.id,
    ticketNumber: result.payment.number,
    amount: result.payment.amount,
    changeReturned: result.payment.changeReturned,
    remaining: result.remaining,
    closed: result.closed,
    tableReleased: Boolean(result.tableReleased),
  });
});

/** Remise (motif obligatoire, plafonnée pour les caissiers, tracée dans le journal d'audit). */
checkoutRouter.post("/discount", async (req, res) => {
  const result = await applyDiscount(req.body, actorOf(req));
  broadcastBillChange(result);
  res.status(201).json({
    discountId: result.discount.id,
    amount: result.discount.amount,
    remaining: result.remaining,
    closed: result.closed,
    tableReleased: Boolean(result.tableReleased),
  });
});

/** Données structurées du ticket de caisse (impression 80 mm / PDF). */
checkoutRouter.get("/receipt/:paymentId", async (req, res) => {
  res.json(await getReceipt(String(req.params.paymentId)));
});
