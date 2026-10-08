import type { Server as HttpServer } from "node:http";
import { Server, type Namespace, type Socket } from "socket.io";
import type { Table } from "@prisma/client";
import { env } from "./lib/env.js";
import { z } from "zod";
import { parseCookie } from "cookie";
import { ACCESS_COOKIE, authenticate, type AuthUser } from "./lib/auth.js";
import { idSchema, isAllowedOrigin, isTrustedOrigin } from "./lib/security.js";
import type { Actor } from "./lib/audit.js";
import { HttpError, toErrorPayload } from "./lib/errors.js";
import { prisma } from "./lib/prisma.js";
import { parseLang, type Lang } from "./lib/i18n.js";
import { createOrder, updateOrderStatus, type OrderWithRelations } from "./services/orders.js";
import type { BillChange, PayResult } from "./services/checkout.js";
import { releaseTableIfIdle } from "./services/tables.js";
import { tableByToken, toPublicOrder, type AssistanceKind, type PublicOrder } from "./services/publicPortal.js";

/**
 * Contrat des événements temps réel.
 *
 * Client → serveur (avec accusé de réception `ack`) :
 *   - `new_order`     : un serveur envoie une commande en cuisine
 *   - `order_status`  : la cuisine fait avancer un bon (PREPARING / READY / SERVED / CANCELLED)
 *
 * Serveur → clients :
 *   - `new_order`     : nouveau bon à préparer (écrans cuisine/bar + tablettes)
 *   - `order_updated` : changement de statut d'un bon
 *   - `table_updated` : changement de statut d'une table
 *   - `payment_recorded` : versement encaissé (solde restant, addition close ou non)
 *   - `bill_updated`  : addition modifiée par une remise
 *   - `menu_updated`  : carte modifiée (rupture de stock, plat ajouté / modifié / supprimé)
 *   - `server_alert`  : un client appelle un serveur depuis le QR code de sa table
 *   - `request_bill`  : un client demande l'addition
 *   - `table_alert_cleared` : demande prise en compte par le personnel
 *
 * Espace de noms public `/public` (clients, sans compte, authentifiés par le jeton du QR code) :
 *   - `order_status_changed` : bon de la table créé ou modifié (vue client épurée)
 *   - `table_updated` : statut de la table / demandes en cours
 *   - `menu_updated`  : la carte a changé (rupture…), à recharger
 */
export interface ServerToClientEvents {
  new_order: (order: OrderWithRelations) => void;
  order_updated: (order: OrderWithRelations) => void;
  table_updated: (table: Pick<Table, "id" | "number" | "status">) => void;
  payment_recorded: (event: PaymentEvent) => void;
  menu_updated: (event: MenuEvent) => void;
  bill_updated: (event: { tableId: string | null; orderIds: string[]; remaining: number; closed: boolean }) => void;
  server_alert: (alert: StaffAlert) => void;
  request_bill: (alert: StaffAlert) => void;
  table_alert_cleared: (event: { tableId: string; number: number; kind: AssistanceKind | "ALL" }) => void;
}

export interface StaffAlert {
  tableId: string;
  number: number;
  kind: AssistanceKind;
  requestedAt: Date;
}

/** Ce que voit un client : sa table uniquement. */
export interface PublicTablePatch {
  status?: string;
  callRequestedAt?: Date | null;
  billRequestedAt?: Date | null;
}

interface PublicServerToClient {
  order_status_changed: (order: PublicOrder) => void;
  table_updated: (patch: PublicTablePatch) => void;
  menu_updated: () => void;
}

export interface MenuEvent {
  action: "created" | "updated" | "deleted" | "availability" | "categories";
  item?: { id: string; nameFr: string; nameEn: string; isAvailable: boolean; isArchived: boolean };
}

export interface PaymentEvent {
  paymentId: string;
  tableId: string | null;
  orderIds: string[];
  amount: number;
  remaining: number;
  closed: boolean;
}

type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  new_order: (payload: unknown, ack: Ack<OrderWithRelations>) => void;
  order_status: (payload: unknown, ack: Ack<OrderWithRelations>) => void;
  set_lang: (lang: unknown) => void;
}

interface SocketData {
  user: AuthUser;
  /** Session (appareil) ayant ouvert la connexion : revérifiée périodiquement */
  sessionId: string;
  ip: string | null;
  /** Langue de l'écran, pour traduire les erreurs renvoyées dans les accusés de réception */
  lang: Lang;
}

/** IP de l'appareil : X-Forwarded-For seulement si la connexion vient d'un proxy local (cf. TRUST_PROXY). */
function clientIp(socket: { handshake: { address: string; headers: Record<string, string | string[] | undefined> } }) {
  const direct = socket.handshake.address;
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  const isLoopback = /^(::1|127\.|::ffff:127\.)/.test(direct);
  if (isLoopback && typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return direct;
}

const orderStatusPayload = z
  .object({ orderId: idSchema, status: z.enum(["PREPARING", "READY", "SERVED", "CANCELLED"]) })
  .strict();

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// Salles Socket.io : chaque appareil rejoint la salle de son rôle.
export const ROOMS = {
  kitchen: "kitchen", // écrans KDS (cuisine & bar)
  floor: "floor", // tablettes des serveurs
  cashier: "cashier", // caisse
  admin: "admin",
} as const;

const roomsByRole: Record<AuthUser["role"], string[]> = {
  ADMIN: Object.values(ROOMS),
  SERVEUR: [ROOMS.floor],
  CUISINE: [ROOMS.kitchen],
  CAISSE: [ROOMS.cashier],
};

let io: IO | undefined;
let publicNs: Namespace<Record<string, never>, PublicServerToClient, Record<string, never>, { tableId: string }> | undefined;

const tableRoom = (tableId: string) => `table:${tableId}`;

/** Bon créé / modifié : les clients de la table (QR) le voient évoluer en direct. */
function notifyCustomers(order: OrderWithRelations) {
  if (order.tableId) publicNs?.to(tableRoom(order.tableId)).emit("order_status_changed", toPublicOrder(order));
}

function notifyCustomerTable(tableId: string, patch: PublicTablePatch) {
  publicNs?.to(tableRoom(tableId)).emit("table_updated", patch);
}

/** Statut d'une table changé : tous les écrans du personnel + les clients de cette table. */
export function broadcastTable(table: { id: string; number: number; status: Table["status"] }) {
  getIO().emit("table_updated", { id: table.id, number: table.number, status: table.status });
  notifyCustomerTable(table.id, {
    status: table.status,
    // Table libérée : les demandes en attente ont été effacées
    ...(table.status === "FREE" && { callRequestedAt: null, billRequestedAt: null }),
  });
}

/** Demande d'un client (appel serveur / addition) relayée aux tablettes concernées. */
export function broadcastAssistance(table: Table, kind: AssistanceKind) {
  const requestedAt = (kind === "CALL" ? table.callRequestedAt : table.billRequestedAt) ?? new Date();
  const alert: StaffAlert = { tableId: table.id, number: table.number, kind, requestedAt };
  if (kind === "CALL") getIO().to([ROOMS.floor, ROOMS.admin]).emit("server_alert", alert);
  else getIO().to([ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("request_bill", alert);
  notifyCustomerTable(table.id, { callRequestedAt: table.callRequestedAt, billRequestedAt: table.billRequestedAt });
}

export function broadcastAssistanceCleared(table: Table, kind: AssistanceKind | "ALL") {
  getIO().to([ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("table_alert_cleared", { tableId: table.id, number: table.number, kind });
  notifyCustomerTable(table.id, { callRequestedAt: table.callRequestedAt, billRequestedAt: table.billRequestedAt });
}

/** QR code régénéré : les clients connectés avec l'ancien jeton sont déconnectés. */
export function disconnectTableCustomers(tableId: string) {
  publicNs?.in(tableRoom(tableId)).disconnectSockets(true);
}

const userRoom = (userId: string) => `user:${userId}`;

/** Coupe les connexions temps réel d'un employé (PIN réinitialisé, compte désactivé…). */
export function disconnectUser(userId: string) {
  getIO().in(userRoom(userId)).disconnectSockets(true);
}

const sessionRoom = (sessionId: string) => `session:${sessionId}`;

/** Déconnexion / session révoquée : le temps réel de cet appareil est coupé immédiatement. */
export function disconnectSession(sessionId: string) {
  getIO().in(sessionRoom(sessionId)).disconnectSockets(true);
}

/**
 * Zero-Trust : une connexion Socket.io ouverte n'est pas un blanc-seing. Toutes les
 * 60 s, les sessions des connexions ouvertes sont revérifiées en base ; une session
 * révoquée, expirée ou un compte désactivé ferme la connexion.
 */
const REVALIDATE_EVERY_MS = 60_000;
async function revalidateSockets() {
  const sockets = await getIO().fetchSockets();
  const ids = [...new Set(sockets.map((s) => s.data.sessionId).filter(Boolean))];
  if (ids.length === 0) return;
  const valid = await prisma.authSession.findMany({
    where: { id: { in: ids }, revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
    select: { id: true },
  });
  const ok = new Set(valid.map((v) => v.id));
  for (const id of ids) if (!ok.has(id)) disconnectSession(id);
}

export function getIO(): IO {
  if (!io) throw new Error("Socket.io n'est pas initialisé");
  return io;
}

/** Diffuse un nouveau bon à tous les postes concernés. */
export function broadcastNewOrder(order: OrderWithRelations) {
  getIO().to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("new_order", order);
  notifyCustomers(order);
  if (order.table) broadcastTable({ id: order.table.id, number: order.table.number, status: "OCCUPIED" });
}

export async function broadcastOrderUpdated(order: OrderWithRelations) {
  getIO().to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("order_updated", order);
  notifyCustomers(order);
  if (order.status === "CANCELLED" || order.status === "PAID") {
    const table = await releaseTableIfIdle(order.tableId);
    if (table) broadcastTable(table);
  }
}

/** Carte modifiée (rupture, prix, nouveau plat…) : toutes les tablettes rechargent la carte. */
export function broadcastMenuUpdated(event: MenuEvent) {
  getIO().emit("menu_updated", event);
  publicNs?.emit("menu_updated");
}

/** Addition modifiée sans encaissement (remise) : caisses à jour, bons / table soldés diffusés. */
export function broadcastBillChange(result: BillChange) {
  const io = getIO();
  io.to([ROOMS.cashier, ROOMS.admin]).emit("bill_updated", {
    tableId: result.tableId,
    orderIds: result.orderIds,
    remaining: result.remaining,
    closed: result.closed,
  });
  for (const order of result.updatedOrders) {
    io.to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("order_updated", order);
    notifyCustomers(order);
  }
  if (result.tableReleased) broadcastTable(result.tableReleased);
}

/** Après un encaissement : caisses, serveurs et KDS sont mis à jour ; la table libérée est diffusée à tous. */
export function broadcastPayment(result: PayResult) {
  const io = getIO();
  io.to([ROOMS.cashier, ROOMS.floor, ROOMS.admin]).emit("payment_recorded", {
    paymentId: result.payment.id,
    tableId: result.tableId,
    orderIds: result.orderIds,
    amount: result.payment.amount,
    remaining: result.remaining,
    closed: result.closed,
  });
  for (const order of result.updatedOrders) {
    io.to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("order_updated", order);
    notifyCustomers(order);
  }
  if (result.tableReleased) broadcastTable(result.tableReleased);
}

function canSendOrders(user: AuthUser) {
  return user.role === "SERVEUR" || user.role === "ADMIN" || user.role === "CAISSE";
}

function canUpdateStatus(user: AuthUser, status: string) {
  if (user.role === "ADMIN" || user.role === "CUISINE") return true;
  // Le serveur peut marquer « servie » depuis sa tablette
  return user.role === "SERVEUR" && status === "SERVED";
}

async function withAck<T>(ack: unknown, fn: () => Promise<T>, lang: Lang = "fr") {
  const reply = typeof ack === "function" ? (ack as Ack<T>) : () => {};
  try {
    reply({ ok: true, data: await fn() });
  } catch (err) {
    reply({ ok: false, error: toErrorPayload(err, lang).error });
  }
}

export function initRealtime(httpServer: HttpServer): IO {
  io = new Server(httpServer, {
    cors: { origin: (origin, cb) => cb(null, !origin || isTrustedOrigin(origin)), credentials: true },
    maxHttpBufferSize: 100_000, // aligné sur la limite des corps JSON de l'API
    // Anti « cross-site WebSocket hijacking » : origine vérifiée avant le handshake
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || isAllowedOrigin(origin, req.headers.host, req.headers["x-forwarded-host"]));
    },
  });

  // Authentification au handshake : cookie de session HttpOnly vérifié (signature,
  // inactivité, compte actif, version de session) AVANT de rejoindre les canaux.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
      const { user, sessionId } = await authenticate(cookies[ACCESS_COOKIE]);
      socket.data.user = user;
      socket.data.sessionId = sessionId;
      socket.data.ip = clientIp(socket);
      socket.data.lang = parseLang(socket.handshake.auth?.lang);
      next();
    } catch {
      next(new Error("Session expirée"));
    }
  });

  // Clients (QR code) : pas de session, le jeton secret de la table fait office de clé.
  // Ils ne reçoivent que les événements de leur table et n'émettent rien.
  const ns = io.of("/public") as unknown as NonNullable<typeof publicNs>;
  publicNs = ns;
  ns.use(async (socket, next) => {
    try {
      const table = await tableByToken(socket.handshake.auth?.token);
      socket.data.tableId = table.id;
      next();
    } catch {
      next(new Error("invalid_qr"));
    }
  });
  ns.on("connection", (socket) => {
    void socket.join(tableRoom(socket.data.tableId));
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
    const { user } = socket.data;
    socket.join([...roomsByRole[user.role], userRoom(user.id), sessionRoom(socket.data.sessionId)]);

    socket.on("new_order", (payload, ack) =>
      withAck(ack, async () => {
        if (!canSendOrders(user)) throw new HttpError(403, "order.roleCannotSend");
        const order = await createOrder(payload, user.id);
        broadcastNewOrder(order);
        return order;
      }, socket.data.lang),
    );

    // L'écran change de langue : les erreurs suivantes lui sont renvoyées dans cette langue
    socket.on("set_lang", (lang) => {
      socket.data.lang = parseLang(lang);
    });

    socket.on("order_status", (payload, ack) =>
      withAck(ack, async () => {
        const { orderId, status } = orderStatusPayload.parse(payload);
        if (!canUpdateStatus(user, status)) throw new HttpError(403, "order.actionForbidden");
        const actor: Actor = { ...user, ip: socket.data.ip };
        const order = await updateOrderStatus(orderId, { status }, actor);
        await broadcastOrderUpdated(order);
        return order;
      }, socket.data.lang),
    );
  });

  setInterval(() => void revalidateSockets().catch((e) => console.error("Revalidation des sockets", e)), REVALIDATE_EVERY_MS).unref();

  return io;
}
