import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";
import { validateIdParams } from "../lib/security.js";
import { listTables } from "../services/tables.js";
import { listOpenOrdersForTable } from "../services/orders.js";
import { clearAssistance } from "../services/publicPortal.js";
import { broadcastAssistanceCleared } from "../realtime.js";

export const tablesRouter = Router();
validateIdParams(tablesRouter, "id");

tablesRouter.get("/", requireAuth(), async (_req, res) => {
  const tables = await listTables();
  // Le jeton du QR code reste réservé au gérant
  res.json(tables.map(({ _count, qrToken: _qr, ...t }) => ({ ...t, openOrders: _count.orders })));
});

tablesRouter.get("/:id/orders", requireAuth(), async (req, res) => {
  res.json(await listOpenOrdersForTable(String(req.params.id)));
});

const clearSchema = z.object({ kind: z.enum(["CALL", "BILL"]).optional() }).strict();

/** Demande du client prise en compte (appel serveur, addition) : l'alerte disparaît partout. */
tablesRouter.post("/:id/requests/clear", requireAuth("SERVEUR", "CAISSE"), async (req, res) => {
  const { kind } = clearSchema.parse(req.body ?? {});
  const table = await clearAssistance(String(req.params.id), kind);
  broadcastAssistanceCleared(table, kind ?? "ALL");
  res.json({ id: table.id, callRequestedAt: table.callRequestedAt, billRequestedAt: table.billRequestedAt });
});
