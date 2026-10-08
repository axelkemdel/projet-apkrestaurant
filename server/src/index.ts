import { createServer } from "node:http";
import express from "express";
import { env } from "./lib/env.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler } from "./lib/errors.js";
import { initRealtime } from "./realtime.js";
import { authRouter } from "./routes/auth.js";
import { menuRouter } from "./routes/menu.js";
import { tablesRouter } from "./routes/tables.js";
import { ordersRouter } from "./routes/orders.js";
import { checkoutRouter } from "./routes/checkout.js";
import { adminRouter } from "./routes/admin.js";
import { UPLOADS_DIR } from "./lib/uploads.js";
import { applySecurity } from "./lib/security.js";

const app = express();
// helmet, CORS sans joker, cookies, limitation de débit, contrôle d'origine (anti-CSRF)
applySecurity(app);
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/auth", authRouter);
app.use("/api/menu", menuRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/admin", adminRouter);

// Images des plats (noms aléatoires, contenu vérifié à l'upload)
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "7d",
    index: false,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);
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
