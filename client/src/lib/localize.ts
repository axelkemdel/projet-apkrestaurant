import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Label, Lang, OrderItemModifiers, OrderLanguage, QuickNote } from "../types";

export function useLang(): Lang {
  return useTranslation().i18n.language === "en" ? "en" : "fr";
}

export const orderLang = (l: OrderLanguage | undefined): Lang => (l === "EN" ? "en" : "fr");
export const toOrderLanguage = (l: Lang): OrderLanguage => (l === "en" ? "EN" : "FR");

/** Libellé dans la langue demandée (anciennes données : simple chaîne). */
export function pick(label: Label | string | null | undefined, lang: Lang): string {
  if (!label) return "";
  if (typeof label === "string") return label;
  return (lang === "en" ? label.en : label.fr) || label.fr;
}

export const itemName = (i: { nameFr: string; nameEn: string }, lang: Lang) => (lang === "en" ? i.nameEn || i.nameFr : i.nameFr);
export const itemDescription = (i: { descriptionFr: string | null; descriptionEn: string | null }, lang: Lang) =>
  (lang === "en" ? i.descriptionEn || i.descriptionFr : i.descriptionFr) ?? "";
export const categoryName = itemName;

/** Détail des options d'une ligne (cuisson, accompagnement, suppléments) dans la langue demandée. */
export function modifiersText(m: OrderItemModifiers | null | undefined, lang: Lang): string {
  if (!m) return "";
  const extras = (m.extras ?? []).map((e) => `+ ${"fr" in e ? pick(e, lang) : e.name}`);
  return [pick(m.cooking, lang), pick(m.side, lang), ...extras].filter(Boolean).join(" · ");
}

/** Notes rapides codifiées, traduites dans la langue demandée. */
export function quickNotesText(codes: readonly QuickNote[] | undefined, t: TFunction, lang: Lang): string {
  return (codes ?? []).map((c) => t(`quickNotes.${c}`, { lng: lang })).join(", ");
}

/** Zones de salle connues traduites ; une zone personnalisée s'affiche telle quelle. */
export function zoneName(zone: string, t: TFunction): string {
  const known: Record<string, "zones.Salle" | "zones.Terrasse" | "zones.VIP"> = {
    Salle: "zones.Salle",
    Terrasse: "zones.Terrasse",
    VIP: "zones.VIP",
  };
  return known[zone] ? t(known[zone]) : zone;
}

/**
 * Libellé d'un versement (enregistré sous forme canonique : « Part 2/4 »,
 * « Articles », « Acompte ») traduit à l'affichage.
 */
export function paymentLabel(label: string | null | undefined, t: TFunction, lang?: Lang): string {
  if (!label) return "";
  const opts = lang ? { lng: lang } : {};
  const part = label.match(/^Part (\d+)\/(\d+)$/);
  if (part) return t("cashier.labelPart", { ...opts, k: part[1], n: part[2] });
  if (label === "Articles") return t("cashier.labelItems", opts);
  if (label === "Acompte") return t("cashier.labelDeposit", opts);
  return label;
}

/** Motifs de remise proposés (stockés en français) et leur traduction. */
export const DISCOUNT_REASONS: Label[] = [
  { fr: "Geste commercial", en: "Goodwill gesture" },
  { fr: "Attente trop longue", en: "Long wait" },
  { fr: "Erreur de commande", en: "Order mistake" },
  { fr: "Client fidèle", en: "Loyal customer" },
  { fr: "Repas du personnel", en: "Staff meal" },
];

/** Motif de remise : traduit s'il s'agit d'un motif proposé, sinon texte libre tel quel. */
export function discountReason(reason: string, lang: Lang): string {
  const known = DISCOUNT_REASONS.find((r) => r.fr === reason || r.en === reason);
  return known ? pick(known, lang) : reason;
}

/** Pourcentage selon l'usage typographique : « 15 % » (fr), « 15% » (en). */
export const formatPercent = (value: number | string, lang: Lang) => (lang === "en" ? `${value}%` : `${value} %`);
