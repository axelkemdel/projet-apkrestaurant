import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../store/auth";
import type { NewOrderPayload, Order, OrderStatus, Table } from "../types";

interface ServerToClient {
  new_order: (order: Order) => void;
  order_updated: (order: Order) => void;
  table_updated: (table: Pick<Table, "id" | "number" | "status">) => void;
  menu_updated: (event: {
    action: "created" | "updated" | "deleted" | "availability" | "categories";
    item?: { id: string; name: string; isAvailable: boolean; isArchived: boolean };
  }) => void;
  bill_updated: (event: { tableId: string | null; orderIds: string[]; remaining: number; closed: boolean }) => void;
  payment_recorded: (event: { paymentId: string; tableId: string | null; orderIds: string[]; amount: number; remaining: number; closed: boolean }) => void;
}

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

interface ClientToServer {
  new_order: (payload: NewOrderPayload, ack: (res: AckResponse<Order>) => void) => void;
  order_status: (payload: { orderId: string; status: OrderStatus }, ack: (res: AckResponse<Order>) => void) => void;
}

export type AppSocket = Socket<ServerToClient, ClientToServer>;

let socket: AppSocket | null = null;

/**
 * Connexion temps réel unique pour la page. Elle s'authentifie avec le cookie de
 * session (envoyé par le navigateur au handshake) : la même instance est
 * déconnectée / reconnectée à chaque changement de session, si bien que les
 * écouteurs posés par les écrans restent valables.
 */
export function getSocket(): AppSocket {
  if (socket) return socket;
  socket = io({ autoConnect: false, withCredentials: true, transports: ["websocket", "polling"] });
  socket.on("connect_error", (err) => {
    if (err.message === "Session expirée") useAuth.getState().expire();
  });
  // Déconnexion forcée par le serveur (PIN réinitialisé, compte désactivé…) : on retente
  // une connexion ; si la session a été révoquée, connect_error ramène à l'écran de connexion.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" && useAuth.getState().user && !useAuth.getState().locked) socket?.connect();
  });
  return socket;
}

/** (Re)connecte avec la session courante (après connexion / déverrouillage). */
export function connectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
}

export function disconnectSocket() {
  socket?.disconnect();
}

/** Émet un événement et attend l'accusé de réception du serveur. */
export async function emitWithAck<E extends keyof ClientToServer>(
  event: E,
  payload: Parameters<ClientToServer[E]>[0],
): Promise<Order> {
  const s = getSocket().timeout(8000);
  // Le typage générique de socket.io ne sait pas corréler `event` et `payload` : on l'aide.
  const emit = s.emitWithAck as unknown as (ev: E, p: typeof payload) => Promise<AckResponse<Order>>;
  const res = await emit.call(s, event, payload);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

/** État de connexion temps réel (pour l'indicateur dans l'en-tête). */
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    setConnected(s.connected);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}
