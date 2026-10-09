import "dotenv/config";
import { randomBytes } from "node:crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

/**
 * Secret de signature des jetons. Un secret faible (court ou valeur d'exemple) rend les
 * jetons falsifiables : refusé en production ; ailleurs (NODE_ENV rarement défini sur un
 * serveur de restaurant), remplacé par un secret aléatoire éphémère — sûr, mais les
 * sessions ne survivent pas à un redémarrage tant qu'un vrai secret n'est pas configuré.
 */
function resolveJwtSecret(): string {
  const value = required("JWT_SECRET");
  if (value.length >= 32 && !/changez-moi|change-me/i.test(value)) return value;
  const hint = "Générez-en un : node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
  if (process.env.NODE_ENV === "production") {
    throw new Error(`JWT_SECRET doit être une valeur aléatoire d'au moins 32 caractères. ${hint}`);
  }
  console.warn(`⚠ JWT_SECRET faible ou d'exemple : secret aléatoire temporaire utilisé (sessions perdues au redémarrage). ${hint}`);
  return randomBytes(48).toString("hex");
}
const jwtSecret = resolveJwtSecret();

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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Toutes les adresses publiques de CE Codespace (https://<codespace>-<port>.app.github.dev),
 * quel que soit le port : interface Vite (5173), serveur Node (4000), application Android
 * pointée sur l'une ou l'autre. Les Codespaces d'autres personnes restent refusés.
 */
const codespaceOrigin =
  CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? new RegExp(`^https://${escapeRe(CODESPACE_NAME)}-\\d{2,5}\\.${escapeRe(GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN)}$`)
    : null;

// Production : liste explicite, HTTPS (ou schéma de l'application native) uniquement
if (process.env.NODE_ENV === "production") {
  if (!process.env.CORS_ORIGIN) throw new Error("CORS_ORIGIN est obligatoire en production (ex. https://appresto.up.railway.app,capacitor://localhost)");
  const insecure = corsOrigin.filter((o) => !o.startsWith("https://") && o !== "capacitor://localhost");
  if (insecure.length) throw new Error(`CORS_ORIGIN : origines non HTTPS refusées en production : ${insecure.join(", ")}`);
}
// Jamais de joker : les cookies de session ne doivent être acceptés que depuis nos propres écrans
if (corsOrigin.some((o) => o === "*" || o.includes("*"))) {
  throw new Error("CORS_ORIGIN ne peut pas contenir de joker « * » : listez les origines autorisées");
}

/** « trust proxy » d'Express : nombre de proxys (Railway : 1), true, ou liste d'adresses (« loopback »). */
function parseTrustProxy(raw: string | undefined): number | boolean | string {
  const value = (raw ?? "loopback").trim();
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true" || value === "false") return value === "true";
  return value;
}

const cookieSameSite = (process.env.COOKIE_SAMESITE ?? "strict").trim().toLowerCase();
if (cookieSameSite !== "strict" && cookieSameSite !== "lax") {
  // « none » exposerait les cookies de session aux requêtes intersites (CSRF)
  throw new Error("COOKIE_SAMESITE doit valoir « strict » (recommandé) ou « lax »");
}

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  corsOrigin,
  codespaceOrigin,
  /** Cookie « Secure » (HTTPS). Ne désactiver qu'en test sur réseau local sans TLS. */
  cookieSecure: process.env.COOKIE_SECURE !== "false",
  /** Attribut SameSite des cookies de session (strict par défaut). */
  cookieSameSite: cookieSameSite as "strict" | "lax",
  /** Inactivité maximale côté serveur (le verrouillage écran côté client intervient avant). */
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? 30),
  /** Plafond de remise cumulée pour un caissier, en % de l'addition (au-delà : gérant). */
  maxCashierDiscountPct: Number(process.env.MAX_CASHIER_DISCOUNT_PCT ?? 15),
  /** Proxys de confiance pour l'IP client (X-Forwarded-For), cf. Express « trust proxy ». */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  /** Commande en autonomie par les clients (QR code). false : consultation de la carte et appels seulement. */
  publicOrdering: process.env.PUBLIC_ORDERING !== "false",
  /** Connexion : échecs tolérés par identifiant et par appareil (IP) sur 5 minutes. */
  loginMaxAttemptsAccount: Number(process.env.LOGIN_MAX_ATTEMPTS_ACCOUNT ?? 5),
  loginMaxAttemptsIp: Number(process.env.LOGIN_MAX_ATTEMPTS_IP ?? 10),
  /** Échecs tolérés par identifiant sur 24 h (second palier anti force brute). */
  loginMaxAttemptsAccountDaily: Number(process.env.LOGIN_MAX_ATTEMPTS_ACCOUNT_DAILY ?? 20),
  /** Durée minimale d'une réponse de connexion (anti attaque temporelle). */
  loginMinResponseMs: Number(process.env.LOGIN_MIN_RESPONSE_MS ?? 800),
};

if (isProduction && !env.cookieSecure) {
  throw new Error("COOKIE_SECURE=false est interdit en production : servez l'application en HTTPS");
}
if (!env.cookieSecure) {
  console.warn("⚠ COOKIE_SECURE=false : cookie de session transmis sans HTTPS. À réserver aux tests en réseau local.");
}
