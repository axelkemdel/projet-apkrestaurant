import { io, type Socket } from "socket.io-client";
import type { PublicOrder, PublicTable } from "../types";

/** Événements reçus par un client (QR code) : uniquement ceux de sa table. */
interface PublicServerToClient {
  order_status_changed: (order: PublicOrder) => void;
  table_updated: (patch: Partial<PublicTable>) => void;
  menu_updated: () => void;
}

export type PublicSocket = Socket<PublicServerToClient, Record<string, never>>;

/**
 * Connexion temps réel du portail client, sur l'espace de noms `/public`. Pas de
 * cookie : le jeton secret de la table (celui du QR code) sert de clé d'accès.
 */
export function connectPublicSocket(token: string): PublicSocket {
  return io("/public", {
    auth: { token },
    withCredentials: false,
    transports: ["websocket", "polling"],
  });
}
