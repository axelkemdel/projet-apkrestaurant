import { Router, type Request } from "express";
import type { MessageKey } from "../lib/i18n.js";
import { keyedLimiter } from "../middleware/rateLimiter.js";
import {
  createCustomerOrder,
  createReview,
  getPortal,
  requestAssistance,
  type AssistanceKind,
} from "../services/publicPortal.js";
import { broadcastAssistance, broadcastNewOrder } from "../realtime.js";

/**
 * API publique du portail client (QR code). Aucune session : chaque appel porte le
 * jeton secret de la table. Débits limités par appareil ET par table, en plus du
 * plafond global de l'API.
 */
export const publicRouter = Router();

const tokenOf = (req: Request) => String(req.params.token ?? req.body?.token ?? "").slice(0, 64);

const limiter = (windowMs: number, limit: number, code: MessageKey) => keyedLimiter(windowMs, limit, code, tokenOf);

const readLimit = limiter(60_000, 120, "http.tooManyRequests");
const orderLimit = limiter(10 * 60_000, 8, "portal.tooManyOrders");
const alertLimit = limiter(10 * 60_000, 12, "portal.tooManyRequests");
const reviewLimit = limiter(60 * 60_000, 5, "http.tooManyRequests");

/** Table, carte bilingue, bons en cours de la table (rejoindre la session existante). */
publicRouter.get("/table/:token", readLimit, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getPortal(req.params.token));
});

/** Commande passée par le client : envoyée directement en cuisine / au bar. */
publicRouter.post("/orders", orderLimit, async (req, res) => {
  const order = await createCustomerOrder(req.body);
  broadcastNewOrder(order);
  res.status(201).json({ id: order.id, number: order.number, totalAmount: order.totalAmount });
});

async function assistance(req: Request, kind: AssistanceKind) {
  const { table, notified } = await requestAssistance(req.params.token, kind);
  // Pendant la minute qui suit une demande, on ne relance pas les tablettes
  if (notified) broadcastAssistance(table, kind);
  return { notified, requestedAt: kind === "CALL" ? table.callRequestedAt : table.billRequestedAt };
}

publicRouter.post("/table/:token/call-server", alertLimit, async (req, res) => {
  res.json(await assistance(req, "CALL"));
});

publicRouter.post("/table/:token/request-bill", alertLimit, async (req, res) => {
  res.json(await assistance(req, "BILL"));
});

publicRouter.post("/reviews", reviewLimit, async (req, res) => {
  res.status(201).json(await createReview(req.body));
});
