const fcfa = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 12500 → "12 500 F" */
export function formatPrice(amount: number): string {
  return `${fcfa.format(amount)} F`;
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
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export const roleLabel = {
  ADMIN: "Gérant",
  SERVEUR: "Serveur",
  CUISINE: "Cuisine / Bar",
  CAISSE: "Caisse",
} as const;

export const paymentModeLabel = {
  CASH: "Espèces",
  CARD: "Carte bancaire",
  ORANGE_MONEY: "Orange Money",
  TELECEL_CASH: "Telecel Cash",
} as const;

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
