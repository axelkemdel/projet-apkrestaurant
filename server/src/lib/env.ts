import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (process.env.NODE_ENV === "production" && (jwtSecret.length < 32 || /changez-moi/i.test(jwtSecret))) {
  throw new Error("JWT_SECRET doit être une valeur aléatoire d'au moins 32 caractères en production");
}

const corsOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// GitHub Codespaces : l'interface est servie via https://<codespace>-5173.<domaine>, on l'autorise d'office
const { CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
if (CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
  const port = process.env.CLIENT_PORT ?? "5173";
  corsOrigin.push(`https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`);
  // Le proxy de Codespaces réécrit l'en-tête Origin en https://localhost:<port>
  corsOrigin.push(`https://localhost:${port}`);
}
// Jamais de joker : les cookies de session ne doivent être acceptés que depuis nos propres écrans
if (corsOrigin.some((o) => o === "*" || o.includes("*"))) {
  throw new Error("CORS_ORIGIN ne peut pas contenir de joker « * » : listez les origines autorisées");
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  corsOrigin,
  /** Cookie « Secure » (HTTPS). Ne désactiver qu'en test sur réseau local sans TLS. */
  cookieSecure: process.env.COOKIE_SECURE !== "false",
  /** Inactivité maximale côté serveur (le verrouillage écran côté client intervient avant). */
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? 30),
  /** Plafond de remise cumulée pour un caissier, en % de l'addition (au-delà : gérant). */
  maxCashierDiscountPct: Number(process.env.MAX_CASHIER_DISCOUNT_PCT ?? 15),
  /** Proxys de confiance pour l'IP client (X-Forwarded-For), cf. Express « trust proxy ». */
  trustProxy: process.env.TRUST_PROXY ?? "loopback",
};

if (!env.cookieSecure) {
  console.warn("⚠ COOKIE_SECURE=false : cookie de session transmis sans HTTPS. À réserver aux tests en réseau local.");
}
