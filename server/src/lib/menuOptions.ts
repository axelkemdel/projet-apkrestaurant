import { z } from "zod";

/** Libellé bilingue (le français est la valeur de référence envoyée par les tablettes). */
export interface Label {
  fr: string;
  en: string;
}
export interface Extra extends Label {
  price: number;
}
export interface MenuOptions {
  cooking?: Label[];
  sides?: Label[];
  extras?: Extra[];
}

/**
 * Notes rapides codifiées : la cuisine les lit dans sa langue (« No onions » →
 * « Sans oignon »), contrairement au texte libre. Libellés dans les dictionnaires du client.
 */
export const QUICK_NOTES = [
  "NO_ONION",
  "NO_CHILI",
  "EXTRA_SPICY",
  "SAUCE_ON_SIDE",
  "NO_SALT",
  "PEANUT_ALLERGY",
  "GLUTEN_FREE",
  "NO_ICE",
] as const;
export type QuickNote = (typeof QUICK_NOTES)[number];

const text = z.string().trim().min(1).max(40);
export const labelSchema = z.object({ fr: text, en: text }).strict();
export const extraSchema = labelSchema.extend({ price: z.number().int().min(0).max(1_000_000) }).strict();

const uniqueFr = <T extends Label>(list: T[]) => new Set(list.map((l) => l.fr.toLowerCase())).size === list.length;

/** Schéma strict des options saisies par le gérant. */
export const optionsInputSchema = z
  .object({
    cooking: z.array(labelSchema).max(12).refine(uniqueFr, "validation.duplicates").optional(),
    sides: z.array(labelSchema).max(12).refine(uniqueFr, "validation.duplicates").optional(),
    extras: z.array(extraSchema).max(15).refine(uniqueFr, "validation.duplicates").optional(),
  })
  .strict();

/**
 * Lecture tolérante des options stockées (JSON) : accepte l'ancien format
 * monolingue (`"Saignant"`, `{ name, price }`) en le recopiant dans les deux langues.
 */
export function normalizeOptions(raw: unknown): MenuOptions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const label = (v: unknown): Label | null => {
    if (typeof v === "string") return { fr: v, en: v };
    if (v && typeof v === "object") {
      const r = v as Record<string, unknown>;
      const fr = typeof r.fr === "string" ? r.fr : typeof r.name === "string" ? r.name : null;
      if (!fr) return null;
      return { fr, en: typeof r.en === "string" && r.en ? r.en : fr };
    }
    return null;
  };
  const list = (v: unknown) => (Array.isArray(v) ? v.map(label).filter((l): l is Label => l !== null) : undefined);
  const extras = Array.isArray(o.extras)
    ? o.extras
        .map((e) => {
          const l = label(e);
          const price = Number((e as { price?: unknown })?.price ?? 0);
          return l && Number.isFinite(price) ? { ...l, price } : null;
        })
        .filter((e): e is Extra => e !== null)
    : undefined;
  return {
    ...(list(o.cooking)?.length && { cooking: list(o.cooking) }),
    ...(list(o.sides)?.length && { sides: list(o.sides) }),
    ...(extras?.length && { extras }),
  };
}
