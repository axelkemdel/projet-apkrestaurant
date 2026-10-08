import { Router } from "express";
import { actorOf, requireAuth } from "../lib/auth.js";
import { validateIdParams } from "../lib/security.js";
import { listAuditLogs } from "../services/auditLogs.js";
import { imageUpload } from "../lib/uploads.js";
import { getDailyStats, getTopItems } from "../services/stats.js";
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  listAdminMenu,
  setAvailability,
  updateCategory,
  updateMenuItem,
} from "../services/adminMenu.js";
import { createUser, listUsers, resetPin, updateUser } from "../services/adminUsers.js";
import { createTable, deleteTable, listAdminTables, listReviews, regenerateQr, updateTable } from "../services/adminTables.js";
import { broadcastMenuUpdated, broadcastTable, disconnectTableCustomers, disconnectUser } from "../realtime.js";
import { clearLoginFailures } from "./auth.js";

export const adminRouter = Router();
validateIdParams(adminRouter, "id");

// Tout le back-office est réservé au gérant
adminRouter.use(requireAuth("ADMIN"));

const id = (v: unknown) => String(v);
const menuEvent = (item: { id: string; nameFr: string; nameEn: string; isAvailable: boolean; isArchived: boolean }) => ({
  id: item.id,
  nameFr: item.nameFr,
  nameEn: item.nameEn,
  isAvailable: item.isAvailable,
  isArchived: item.isArchived,
});

// --- Statistiques -----------------------------------------------------------

/** KPI du jour (?date=AAAA-MM-JJ, défaut : aujourd'hui en heure locale du restaurant). */
adminRouter.get("/stats/daily", async (req, res) => {
  res.json(await getDailyStats({ date: req.query.date }));
});

/** Plats les plus vendus (?period=day|week|month&date=…&limit=…). */
adminRouter.get("/stats/top-items", async (req, res) => {
  res.json(await getTopItems({ date: req.query.date, period: req.query.period, limit: req.query.limit }));
});

// --- Carte ------------------------------------------------------------------

adminRouter.get("/menu", async (_req, res) => {
  res.json(await listAdminMenu());
});

/** Création d'un plat (multipart/form-data : champs + `image` facultatif). */
adminRouter.post("/menu", imageUpload, async (req, res) => {
  const item = await createMenuItem(req.body, actorOf(req), req.file);
  broadcastMenuUpdated({ action: "created", item: menuEvent(item) });
  res.status(201).json(item);
});

adminRouter.put("/menu/:id", imageUpload, async (req, res) => {
  const item = await updateMenuItem(id(req.params.id), req.body, actorOf(req), req.file);
  broadcastMenuUpdated({ action: "updated", item: menuEvent(item) });
  res.json(item);
});

/** Rupture de stock : bascule (ou fixe via { isAvailable }) et notifie les tablettes. */
adminRouter.patch("/menu/:id/toggle-availability", async (req, res) => {
  const item = await setAvailability(id(req.params.id), req.body);
  broadcastMenuUpdated({ action: "availability", item: menuEvent(item) });
  res.json(item);
});

adminRouter.delete("/menu/:id", async (req, res) => {
  const item = await deleteMenuItem(id(req.params.id), actorOf(req));
  broadcastMenuUpdated({ action: "deleted", item: menuEvent(item) });
  res.status(204).end();
});

adminRouter.post("/categories", async (req, res) => {
  const category = await createCategory(req.body);
  broadcastMenuUpdated({ action: "categories" });
  res.status(201).json(category);
});

adminRouter.put("/categories/:id", async (req, res) => {
  const category = await updateCategory(id(req.params.id), req.body);
  broadcastMenuUpdated({ action: "categories" });
  res.json(category);
});

adminRouter.delete("/categories/:id", async (req, res) => {
  await deleteCategory(id(req.params.id));
  broadcastMenuUpdated({ action: "categories" });
  res.status(204).end();
});

// --- Personnel --------------------------------------------------------------

adminRouter.get("/users", async (_req, res) => {
  res.json(await listUsers());
});

/** Création d'un profil ; le PIN (saisi ou généré) est renvoyé une seule fois. */
adminRouter.post("/users", async (req, res) => {
  res.status(201).json(await createUser(req.body, actorOf(req)));
});

adminRouter.put("/users/:id", async (req, res) => {
  const { user, revoked } = await updateUser(id(req.params.id), req.body, actorOf(req));
  if (revoked) disconnectUser(user.id);
  res.json(user);
});

/** Réinitialise le PIN ({ pin } ou généré) ; renvoyé une seule fois, sessions de l'employé fermées. */
adminRouter.put("/users/:id/pin", async (req, res) => {
  const { user, pin, revoked } = await resetPin(id(req.params.id), req.body, actorOf(req));
  clearLoginFailures(user.id);
  if (revoked) disconnectUser(user.id);
  res.json({ user, pin });
});

// --- Plan de salle & QR codes -----------------------------------------------

adminRouter.get("/tables", async (_req, res) => {
  res.json(await listAdminTables());
});

adminRouter.post("/tables", async (req, res) => {
  const table = await createTable(req.body);
  broadcastTable(table);
  res.status(201).json(table);
});

adminRouter.put("/tables/:id", async (req, res) => {
  const table = await updateTable(id(req.params.id), req.body);
  broadcastTable(table);
  res.json(table);
});

adminRouter.delete("/tables/:id", async (req, res) => {
  const table = await deleteTable(id(req.params.id));
  broadcastTable(table);
  res.status(204).end();
});

/** Nouveau QR code pour la table : l'ancien est invalidé, les clients connectés avec lui sont déconnectés. */
adminRouter.post("/tables/:id/regenerate-qr", async (req, res) => {
  const table = await regenerateQr(id(req.params.id), actorOf(req));
  disconnectTableCustomers(table.id);
  res.json(table);
});

// --- Avis clients (portail QR) -----------------------------------------------

adminRouter.get("/reviews", async (req, res) => {
  res.json(await listReviews(req.query));
});

// --- Journal d'audit (lecture seule : aucune route de modification ou suppression) ---

/** ?action=…&userId=…&from=AAAA-MM-JJ&to=AAAA-MM-JJ&cursor=…&limit=50 */
adminRouter.get("/audit-logs", async (req, res) => {
  res.json(await listAuditLogs(req.query));
});
