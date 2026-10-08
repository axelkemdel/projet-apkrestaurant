import { api } from "./api";
import { connectSocket, disconnectSocket } from "./socket";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import type { Role, User } from "../types";

/**
 * Verrouillage automatique après inactivité (minutes), par rôle. Les écrans
 * cuisine sont des affichages muraux permanents : jamais verrouillés.
 * Le serveur ferme de toute façon une session inactive (SESSION_IDLE_MINUTES).
 */
export const IDLE_LOCK_MINUTES: Record<Role, number | null> = {
  ADMIN: 5,
  CAISSE: 5,
  SERVEUR: 10,
  CUISINE: null,
};

export async function restoreSession() {
  // Nettoyage : anciennes versions stockaient un jeton dans localStorage
  try {
    localStorage.removeItem("restoapp-auth");
  } catch {
    /* stockage indisponible */
  }
  try {
    const { user } = await api<{ user: User | null }>("/auth/me");
    if (!user) return useAuth.getState().clear();
    useAuth.getState().setSession(user);
    connectSocket();
  } catch {
    useAuth.getState().clear();
  }
}

export async function loginWithPin(userId: string, pin: string) {
  const { user } = await api<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ userId, pin }) });
  useAuth.getState().setSession(user);
  connectSocket();
  return user;
}

/** Verrouille l'écran : session serveur fermée, socket coupé, saisie du PIN requise pour reprendre. */
export async function lockSession() {
  useAuth.getState().setLocked();
  disconnectSocket();
  await api("/auth/logout", { method: "POST" }).catch(() => {});
}

export async function logout() {
  disconnectSocket();
  useCart.getState().resetTarget();
  useAuth.getState().clear();
  await api("/auth/logout", { method: "POST" }).catch(() => {});
}

// Session expirée côté serveur (401, socket refusé) : plus de temps réel
useAuth.subscribe((state, prev) => {
  if (prev.user && !state.user) {
    disconnectSocket();
    useCart.getState().resetTarget();
  }
});
