import { create } from "zustand";
import type { Extra, Label, MenuItem, NewOrderLine, OrderType, QuickNote, Table } from "../types";

export interface CartLine {
  key: string;
  item: MenuItem;
  quantity: number;
  /** Options choisies avec leurs libellés FR/EN (le français est envoyé au serveur) */
  cooking?: Label;
  side?: Label;
  extras: Extra[];
  quickNotes: QuickNote[];
  /** Texte libre (non traduit) */
  notes?: string;
}

export type CartLineInput = Omit<CartLine, "key">;

interface CartState {
  orderType: OrderType;
  table: Table | null;
  lines: CartLine[];
  selectTable: (table: Table) => void;
  selectTakeaway: () => void;
  resetTarget: () => void;
  add: (line: CartLineInput) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

/** Deux lignes identiques (même plat, mêmes options, mêmes notes) sont fusionnées. */
export function lineKey(l: CartLineInput): string {
  return [
    l.item.id,
    l.cooking?.fr ?? "",
    l.side?.fr ?? "",
    l.extras.map((e) => e.fr).sort().join("+"),
    [...l.quickNotes].sort().join("+"),
    l.notes ?? "",
  ].join("|");
}

export function lineUnitPrice(l: Pick<CartLine, "item" | "extras">): number {
  return l.item.price + l.extras.reduce((sum, e) => sum + e.price, 0);
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineUnitPrice(l) * l.quantity, 0);
}

export function toOrderLines(lines: CartLine[]): NewOrderLine[] {
  return lines.map((l) => ({
    menuItemId: l.item.id,
    quantity: l.quantity,
    notes: l.notes,
    quickNotes: l.quickNotes,
    cooking: l.cooking?.fr,
    side: l.side?.fr,
    extras: l.extras.map((e) => e.fr),
  }));
}

export const useCart = create<CartState>()((set) => ({
  orderType: "DINE_IN",
  table: null,
  lines: [],
  selectTable: (table) => set({ table, orderType: "DINE_IN" }),
  selectTakeaway: () => set({ table: null, orderType: "TAKEAWAY" }),
  resetTarget: () => set({ table: null, orderType: "DINE_IN", lines: [] }),
  add: (input) =>
    set((s) => {
      const key = lineKey(input);
      const existing = s.lines.find((l) => l.key === key);
      if (existing) {
        return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + input.quantity } : l)) };
      }
      return { lines: [...s.lines, { ...input, key }] };
    }),
  setQuantity: (key, quantity) =>
    set((s) => ({
      lines: quantity <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, quantity } : l)),
    })),
  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
  clear: () => set({ lines: [] }),
}));
