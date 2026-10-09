import { api, refreshSession } from "./api";
import { connectSocket, disconnectSocket } from "./socket";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import type { Role, User } from "../types";

/**
 * Déconnexion automatique après inactivité (souris, toucher, clavier) : avertissement au
 * bout de 4 min, déconnexion 60 s plus tard sans réponse (5 min au total).
 */
export const AUTO_LOGOUT = {
  // Réglables à la compilation pour les essais (VITE_AUTO_LOGOUT_WARN_MS, VITE_AUTO_LOGOUT_COUNTDOWN_S)
  warnAfterMs: Number(import.meta.env.VITE_AUTO_LOGOUT_WARN_MS) || 4 * 60_000,
  countdownSeconds: Number(import.meta.env.VITE_AUTO_LOGOUT_COUNTDOWN_S) || 60,
} as const;

/**
 * Les écrans cuisine (KDS) sont des affichages muraux permanents que personne ne touche
 * pendant le service : jamais déconnectés pour inactivité (session bornée à 14 h côté serveur).
 */
export const autoLogoutApplies = (role: Role) => role !== "CUISINE";

/** Le jeton d'accès vit 15 min : renouvelé toutes les 12 min tant que l'écran est utilisé. */
const REFRESH_EVERY_MS = 12 * 60_000;
let lastActivity = Date.now();
if (typeof window !== "undefined") {
  for (const e of ["pointerdown", "keydown"]) window.addEventListener(e, () => (lastActivity = Date.now()), { passive: true });
  setInterval(async () => {
    const { user, locked } = useAuth.getState();
    if (!user || locked) return;
    // Sans activité, on laisse la session expirer (sauf écran cuisine, affichage permanent)
    if (user.role !== "CUISINE" && Date.now() - lastActivity > REFRESH_EVERY_MS) return;
    if (!(await refreshSession())) useAuth.getState().expire();
  }, REFRESH_EVERY_MS);
}

export async function restoreSession() {
  // Nettoyage : anciennes versions stockaient un jeton dans localStorage
  try {
    localStorage.removeItem("restoapp-auth");
  } catch {
    /* stockage indisponible */
  }
  try {
    // Le serveur renouvelle silencieusement un jeton d'accès expiré (cookie de rafraîchissement)
    const { user } = await api<{ user: User | null }>("/auth/me");
    if (!user) return useAuth.getState().clear();
    useAuth.getState().setSession(user);
    connectSocket();
  } catch {
    useAuth.getState().clear();
  }
}

/** Connexion par identifiant + code PIN ; les jetons sont posés en cookies HttpOnly par le serveur. */
export async function loginWithCredentials(username: string, pin: string) {
  const { user } = await api<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, pin }) });
  lastActivity = Date.now();
  useAuth.getState().setSession(user);
  connectSocket();
  return user;
}

/** Verrouille l'écran : session serveur révoquée, socket coupé, saisie du PIN requise pour reprendre. */
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
