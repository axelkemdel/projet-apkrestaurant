import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./lib/errors.js";
import { initRealtime } from "./realtime.js";
import { authRouter } from "./routes/auth.js";
import { menuRouter } from "./routes/menu.js";
import { tablesRouter } from "./routes/tables.js";
import { ordersRouter } from "./routes/orders.js";
import { checkoutRouter } from "./routes/checkout.js";

const app = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/menu", menuRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});
app.use(errorHandler);

const httpServer = createServer(app);
initRealtime(httpServer);

httpServer.listen(env.port, () => {
  console.log(`RestoApp API + Socket.io sur http://localhost:${env.port}`);
});

async function shutdown() {
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
