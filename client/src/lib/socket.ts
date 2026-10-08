import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../store/auth";
import { currentLang } from "../i18n";
import { refreshSession } from "./api";
import type { NewOrderPayload, Order, OrderStatus, StaffAlert, Table } from "../types";

interface ServerToClient {
  new_order: (order: Order) => void;
  order_updated: (order: Order) => void;
  table_updated: (table: Pick<Table, "id" | "number" | "status">) => void;
  menu_updated: (event: {
    action: "created" | "updated" | "deleted" | "availability" | "categories";
    item?: { id: string; nameFr: string; nameEn: string; isAvailable: boolean; isArchived: boolean };
  }) => void;
  bill_updated: (event: { tableId: string | null; orderIds: string[]; remaining: number; closed: boolean }) => void;
  payment_recorded: (event: { paymentId: string; tableId: string | null; orderIds: string[]; amount: number; remaining: number; closed: boolean }) => void;
  /** Client (QR code) : appel d'un serveur / demande d'addition, puis prise en compte */
  server_alert: (alert: StaffAlert) => void;
  request_bill: (alert: StaffAlert) => void;
  table_alert_cleared: (event: { tableId: string; number: number; kind: "CALL" | "BILL" | "ALL" }) => void;
}

type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };

interface ClientToServer {
  set_lang: (lang: string) => void;
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
  // `auth` évalué à chaque connexion : la langue courante est transmise au serveur
  socket = io({
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: (cb) => cb({ lang: currentLang() }),
  });
  // Jeton d'accès expiré (15 min) au moment d'une reconnexion : rafraîchissement puis nouvel
  // essai, une fois par minute au plus ; sinon retour à l'écran de connexion
  let lastRetry = 0;
  socket.on("connect_error", async (err) => {
    if (err.message !== "Session expirée") return;
    const { user, locked } = useAuth.getState();
    if (user && !locked && Date.now() - lastRetry > 60_000) {
      lastRetry = Date.now();
      if (await refreshSession()) return void socket?.connect();
    }
    useAuth.getState().expire();
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
export async function emitWithAck<E extends "new_order" | "order_status">(
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
