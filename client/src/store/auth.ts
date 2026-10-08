import { create } from "zustand";
import type { User } from "../types";

/**
 * État de session côté écran. Le jeton lui-même n'est JAMAIS accessible au
 * JavaScript : il vit dans un cookie HttpOnly posé par le serveur. On ne garde
 * ici que l'identité affichée et l'état de verrouillage (rien dans localStorage).
 */
interface AuthState {
  status: "checking" | "ready";
  user: User | null;
  /** Écran verrouillé après inactivité : la session serveur est fermée, l'identité reste affichée. */
  locked: boolean;
  setSession: (user: User) => void;
  setLocked: () => void;
  /** Session refusée par le serveur (401) : retour à l'écran de connexion, sauf si l'écran est déjà verrouillé. */
  expire: () => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: "checking",
  user: null,
  locked: false,
  setSession: (user) => set({ user, locked: false, status: "ready" }),
  setLocked: () => set({ locked: true }),
  expire: () => {
    if (!get().locked) set({ user: null, status: "ready" });
  },
  clear: () => set({ user: null, locked: false, status: "ready" }),
}));
