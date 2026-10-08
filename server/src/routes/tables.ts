import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { listTables } from "../services/tables.js";
import { listOpenOrdersForTable } from "../services/orders.js";

export const tablesRouter = Router();

tablesRouter.get("/", requireAuth(), async (_req, res) => {
  const tables = await listTables();
  res.json(tables.map(({ _count, ...t }) => ({ ...t, openOrders: _count.orders })));
});

tablesRouter.get("/:id/orders", requireAuth(), async (req, res) => {
  res.json(await listOpenOrdersForTable(String(req.params.id)));
});
