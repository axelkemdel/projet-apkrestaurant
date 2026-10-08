import type { OrderItemModifiers } from "../types";

/** Détail des options d'une ligne (cuisson, accompagnement, suppléments). */
export function modifiersText(m: OrderItemModifiers | null | undefined): string {
  if (!m) return "";
  return [m.cooking, m.side, ...(m.extras?.map((e) => `+ ${e.name}`) ?? [])].filter(Boolean).join(" · ");
}
