import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { lineKey, type CartLine, type CartLineInput } from "./cart";
import type { Category } from "../types";

interface GuestCartState {
  /** Jeton de la table à laquelle appartient ce panier (un autre QR code repart d'un panier vide) */
  token: string | null;
  lines: CartLine[];
  note: string;
  bind: (token: string) => void;
  add: (line: CartLineInput) => void;
  setQuantity: (key: string, quantity: number) => void;
  setNote: (note: string) => void;
  clear: () => void;
  /** Recale le panier sur la carte à jour : prix actuels, plats épuisés ou retirés enlevés. Renvoie les plats retirés. */
  sync: (menu: Category[]) => CartLine[];
}

/**
 * Panier du client (portail QR), conservé le temps de l'onglet (sessionStorage) :
 * un rechargement de page ne fait pas perdre la commande en cours de composition.
 */
export const useGuestCart = create<GuestCartState>()(
  persist(
    (set, get) => ({
      token: null,
      lines: [],
      note: "",
      bind: (token) => {
        if (get().token !== token) set({ token, lines: [], note: "" });
      },
      add: (input) =>
        set((s) => {
          const key = lineKey(input);
          const existing = s.lines.find((l) => l.key === key);
          if (existing) {
            return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + input.quantity) } : l)) };
          }
          return { lines: [...s.lines, { ...input, quantity: Math.min(20, input.quantity), key }] };
        }),
      setQuantity: (key, quantity) =>
        set((s) => ({
          lines:
            quantity <= 0
              ? s.lines.filter((l) => l.key !== key)
              : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, quantity) } : l)),
        })),
      setNote: (note) => set({ note }),
      clear: () => set({ lines: [], note: "" }),
      sync: (menu) => {
        const byId = new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i]));
        const removed: CartLine[] = [];
        const lines = get().lines.flatMap((l) => {
          const item = byId.get(l.item.id);
          if (!item || !item.isAvailable) {
            removed.push(l);
            return [];
          }
          return [{ ...l, item }];
        });
        set({ lines });
        return removed;
      },
    }),
    { name: "restoapp-guest-cart", storage: createJSONStorage(() => sessionStorage) },
  ),
);
