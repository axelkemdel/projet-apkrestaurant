import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { Table } from "@prisma/client";
import { env } from "./lib/env.js";
import { z } from "zod";
import { parseCookie } from "cookie";
import { authenticate, SESSION_COOKIE, type AuthUser } from "./lib/auth.js";
import { idSchema, isAllowedOrigin } from "./lib/security.js";
import type { Actor } from "./lib/audit.js";
import { HttpError, toErrorPayload } from "./lib/errors.js";
import { createOrder, updateOrderStatus, type OrderWithRelations } from "./services/orders.js";
import type { BillChange, PayResult } from "./services/checkout.js";
import { releaseTableIfIdle } from "./services/tables.js";

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
 */
export interface ServerToClientEvents {
  new_order: (order: OrderWithRelations) => void;
  order_updated: (order: OrderWithRelations) => void;
  table_updated: (table: Pick<Table, "id" | "number" | "status">) => void;
  payment_recorded: (event: PaymentEvent) => void;
  menu_updated: (event: MenuEvent) => void;
  bill_updated: (event: { tableId: string | null; orderIds: string[]; remaining: number; closed: boolean }) => void;
}

export interface MenuEvent {
  action: "created" | "updated" | "deleted" | "availability" | "categories";
  item?: { id: string; name: string; isAvailable: boolean; isArchived: boolean };
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
}

interface SocketData {
  user: AuthUser;
  ip: string | null;
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

const userRoom = (userId: string) => `user:${userId}`;

/** Coupe les connexions temps réel d'un employé (PIN réinitialisé, compte désactivé…). */
export function disconnectUser(userId: string) {
  getIO().in(userRoom(userId)).disconnectSockets(true);
}

export function getIO(): IO {
  if (!io) throw new Error("Socket.io n'est pas initialisé");
  return io;
}

/** Diffuse un nouveau bon à tous les postes concernés. */
export function broadcastNewOrder(order: OrderWithRelations) {
  getIO().to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("new_order", order);
  if (order.table) {
    getIO().emit("table_updated", { id: order.table.id, number: order.table.number, status: "OCCUPIED" });
  }
}

export async function broadcastOrderUpdated(order: OrderWithRelations) {
  getIO().to([ROOMS.kitchen, ROOMS.floor, ROOMS.cashier, ROOMS.admin]).emit("order_updated", order);
  if (order.status === "CANCELLED" || order.status === "PAID") {
    const table = await releaseTableIfIdle(order.tableId);
    if (table) getIO().emit("table_updated", { id: table.id, number: table.number, status: table.status });
  }
}

/** Carte modifiée (rupture, prix, nouveau plat…) : toutes les tablettes rechargent la carte. */
export function broadcastMenuUpdated(event: MenuEvent) {
  getIO().emit("menu_updated", event);
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
  }
  if (result.tableReleased) io.emit("table_updated", result.tableReleased);
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
  }
  if (result.tableReleased) io.emit("table_updated", result.tableReleased);
}

function canSendOrders(user: AuthUser) {
  return user.role === "SERVEUR" || user.role === "ADMIN" || user.role === "CAISSE";
}

function canUpdateStatus(user: AuthUser, status: string) {
  if (user.role === "ADMIN" || user.role === "CUISINE") return true;
  // Le serveur peut marquer « servie » depuis sa tablette
  return user.role === "SERVEUR" && status === "SERVED";
}

async function withAck<T>(ack: unknown, fn: () => Promise<T>) {
  const reply = typeof ack === "function" ? (ack as Ack<T>) : () => {};
  try {
    reply({ ok: true, data: await fn() });
  } catch (err) {
    reply({ ok: false, error: toErrorPayload(err).error });
  }
}

export function initRealtime(httpServer: HttpServer): IO {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
    maxHttpBufferSize: 100_000, // aligné sur la limite des corps JSON de l'API
    // Anti « cross-site WebSocket hijacking » : origine vérifiée avant le handshake
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || isAllowedOrigin(origin, req.headers.host));
    },
  });

  // Authentification au handshake : cookie de session HttpOnly vérifié (signature,
  // inactivité, compte actif, version de session) AVANT de rejoindre les canaux.
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
      const { user } = await authenticate(cookies[SESSION_COOKIE]);
      socket.data.user = user;
      socket.data.ip = clientIp(socket);
      next();
    } catch {
      next(new Error("Session expirée"));
    }
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
    const { user } = socket.data;
    socket.join([...roomsByRole[user.role], userRoom(user.id)]);

    socket.on("new_order", (payload, ack) =>
      withAck(ack, async () => {
        if (!canSendOrders(user)) throw new HttpError(403, "Rôle non autorisé à envoyer des commandes");
        const order = await createOrder(payload, user.id);
        broadcastNewOrder(order);
        return order;
      }),
    );

    socket.on("order_status", (payload, ack) =>
      withAck(ack, async () => {
        const { orderId, status } = orderStatusPayload.parse(payload);
        if (!canUpdateStatus(user, status)) throw new HttpError(403, "Action non autorisée pour ce rôle");
        const actor: Actor = { ...user, ip: socket.data.ip };
        const order = await updateOrderStatus(orderId, { status }, actor);
        await broadcastOrderUpdated(order);
        return order;
      }),
    );
  });

  return io;
}
