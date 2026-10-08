import { currentLang } from "../i18n";

// Formats dépendant de la langue de l'écran (séparateurs de milliers, heures…)
const locale = () => (currentLang() === "en" ? "en-GB" : "fr-FR");

/** 12500 → « 12 500 F » (fr) / « 12,500 F » (en) */
export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(amount)} F`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

/** Minutes écoulées depuis une date ISO. */
export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function formatElapsed(iso: string, now: number): string {
  const total = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string, lang?: "fr" | "en"): string {
  return new Date(iso).toLocaleString(lang ? (lang === "en" ? "en-GB" : "fr-FR") : locale(), { dateStyle: "short", timeStyle: "short" });
}
