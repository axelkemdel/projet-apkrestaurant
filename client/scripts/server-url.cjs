// Adresse du serveur THAONI APP chargée par l'application Android (Capacitor).
// Module CommonJS partagé par capacitor.config.ts, vite.config.ts et le script réseau Android.
//
// Ordre de résolution :
//   1. CAP_SERVER_URL, ou VITE_SERVER_URL (adresse explicite, recommandé en production) ;
//   2. GitHub Codespaces : https://<codespace>-<port>.app.github.dev (port CAP_SERVER_PORT, 5173 par défaut) ;
//   3. hors intégration continue : http://<IP locale de la machine>:<port> (réseau du restaurant).
const os = require("node:os");

function normalize(raw) {
  const url = new URL(raw.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Adresse de serveur invalide (http/https attendu) : ${raw}`);
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** IPv4 privée de la machine (Wi-Fi / Ethernet du restaurant), ponts Docker ignorés. */
function lanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|virbr|lo)/.test(name)) continue;
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) candidates.push(a.address);
  }
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** @returns {{ url: string, source: string } | null} */
function resolveServerUrl(env = process.env) {
  const explicit = (env.CAP_SERVER_URL || env.VITE_SERVER_URL || "").trim();
  if (explicit) return { url: normalize(explicit), source: env.CAP_SERVER_URL ? "CAP_SERVER_URL" : "VITE_SERVER_URL" };
  const port = (env.CAP_SERVER_PORT || "5173").trim();
  if (env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return { url: `https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`, source: "GitHub Codespaces" };
  }
  // Sur un serveur d'intégration continue, l'IP de la machine de compilation n'a aucun sens
  if (!env.CI) {
    const ip = lanIp();
    if (ip) return { url: `http://${ip}:${port}`, source: "IP locale" };
  }
  return null;
}

module.exports = { resolveServerUrl };
