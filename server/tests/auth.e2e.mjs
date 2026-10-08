/**
 * Connexion « Zero-Trust » de bout en bout, sur une base de démo fraîche et une API
 * redémarrée (les compteurs anti force brute sont en mémoire) :
 *
 *   npm run db:seed -w server && npm run dev -w server
 *   npm run test:auth -w server
 *
 * Couvre : aucune liste de comptes publique, message d'erreur et durée de réponse
 * uniformes, cookies (accès 15 min + rafraîchissement limité à /api/auth), rotation et
 * détection de rejeu du jeton de rafraîchissement, jetons forgés, rafraîchissement
 * silencieux, RBAC + journalisation des refus, gestion des comptes réservée au gérant,
 * révocation immédiate (désactivation, déconnexion, socket), journal des connexions,
 * anti force brute (par identifiant et par appareil), interface servie avec sa CSP.
 */
import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const BASE = "http://localhost:4000";
const API = `${BASE}/api`;
const db = new PrismaClient();

const cookiesOf = (r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const pick = (cookie, name) => cookie.split("; ").find((c) => c.startsWith(`${name}=`)) ?? "";
/** `device` : IP simulée (X-Forwarded-For, l'API faisant confiance au proxy local) pour isoler les compteurs anti force brute. */
async function loginRaw(username, pin, extra = {}, device) {
  const t0 = performance.now();
  const headers = { "content-type": "application/json", ...(device && { "x-forwarded-for": device }) };
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers, body: JSON.stringify({ username, pin, ...extra }) });
  const ms = performance.now() - t0;
  return { r, ms, body: await r.json().catch(() => ({})), cookie: cookiesOf(r), raw: r.headers.getSetCookie() };
}
async function login(username, pin) {
  const { cookie, r } = await loginRaw(username, pin);
  if (r.status !== 200) throw new Error(`login ${username} → ${r.status}`);
  return cookie;
}
async function call(cookie, path, body, method, headers = {}) {
  const r = await fetch(`${API}${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: body && JSON.stringify(body),
  });
  const txt = await r.text();
  let j = {};
  try {
    j = txt ? JSON.parse(txt) : {};
  } catch {}
  return Array.isArray(j) ? Object.assign(j, { s: r.status, _r: r }) : { s: r.status, ...j, _r: r };
}
let failures = 0;
const ok = (c, m) => {
  if (!c) failures++;
  console.log(c ? "✔" : "✘", m);
};

// --- Rien n'est exposé avant authentification ---------------------------------
ok((await fetch(`${API}/auth/users`)).status === 404, "aucune liste publique des comptes (/api/auth/users supprimée)");
ok((await call(null, "/auth/register", { username: "x", pin: "1234" })).s === 404, "inscription publique inexistante");
ok((await call(null, "/admin/users", { name: "Pirate", username: "pirate", role: "ADMIN" })).s === 401, "création de compte sans session refusée");

// --- Erreurs et durées uniformes ------------------------------------------------
const unknown = await loginRaw("personne", "1234", {}, "10.0.0.1");
const badPin = await loginRaw("awa", "9999", {}, "10.0.0.1");
const malformed = await loginRaw("awa", "12", {}, "10.0.0.1");
ok(
  [unknown, badPin, malformed].every((x) => x.r.status === 401 && x.body.error === "Identifiants invalides" && x.body.code === "auth.invalidCredentials"),
  "même réponse : identifiant inconnu / PIN faux / PIN mal formé",
);
ok([unknown, badPin, malformed].every((x) => !x.cookie), "aucun cookie posé en cas d'échec");
const times = [unknown, badPin, malformed].map((x) => Math.round(x.ms));
ok(times.every((ms) => ms >= 780) && Math.max(...times) - Math.min(...times) < 300, `durée constante (≥ 800 ms, écart faible) : ${times.join(" / ")} ms`);
ok((await loginRaw("awa", "1111", { role: "ADMIN" }, "10.0.0.1")).r.status === 400, "Zod strict : champ inconnu refusé");

// --- Session : deux cookies HttpOnly -------------------------------------------
const L = await loginRaw("Awa", "1111");
ok(L.r.status === 200 && L.body.user.username === "awa" && L.body.user.role === "SERVEUR" && !("token" in L.body), "connexion (identifiant insensible à la casse), aucun jeton dans le JSON");
ok(L.ms >= 780, `succès aussi à durée constante (${Math.round(L.ms)} ms)`);
const atRaw = L.raw.find((c) => c.startsWith("restoapp_at="));
const rtRaw = L.raw.find((c) => c.startsWith("restoapp_rt="));
ok(/HttpOnly/.test(atRaw) && /SameSite=Strict/.test(atRaw) && /Secure/.test(atRaw) && /Max-Age=900/.test(atRaw) && /Path=\//.test(atRaw), "jeton d'accès : 15 min, HttpOnly, SameSite=Strict, Secure");
ok(/HttpOnly/.test(rtRaw) && /SameSite=Strict/.test(rtRaw) && /Secure/.test(rtRaw) && /Path=\/api\/auth/.test(rtRaw), "jeton de rafraîchissement : limité à /api/auth, HttpOnly, SameSite=Strict, Secure");
const W = L.cookie;
const access = jwt.decode(pick(W, "restoapp_at").split("=")[1]);
ok(access.exp - access.iat === 900 && access.typ === "access" && access.sid && !("role" in access) && !("pin" in access), "JWT d'accès : 15 min, sans rôle ni donnée sensible (rôle relu en base)");
const session = await db.authSession.findUnique({ where: { id: access.sid } });
ok(session && !session.tokenHash.includes(pick(W, "restoapp_rt").split(".")[1]) && /^[0-9a-f]{64}$/.test(session.tokenHash), "jeton de rafraîchissement stocké haché (SHA-256)");

// --- Jetons forgés / altérés ----------------------------------------------------
const forged = jwt.sign({ sid: access.sid, sv: 0, typ: "access" }, "mauvais-secret", { subject: access.sub, issuer: "restoapp", audience: "restoapp-api", expiresIn: 900 });
ok((await call(`restoapp_at=${forged}`, "/tables")).s === 401, "jeton signé avec une autre clé refusé");
const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ ...access })).toString("base64url")}.`;
ok((await call(`restoapp_at=${none}`, "/tables")).s === 401, "jeton « alg: none » refusé");
const refreshAsAccess = jwt.sign({ sid: access.sid, sv: 0 }, process.env.JWT_SECRET, { subject: access.sub, issuer: "restoapp", audience: "restoapp-api", expiresIn: 900 });
ok((await call(`restoapp_at=${refreshAsAccess}`, "/tables")).s === 401, "jeton sans type « access » refusé");
ok((await call(null, "/tables", null, "GET", { authorization: `Bearer ${pick(W, "restoapp_at").split("=")[1]}` })).s === 401, "en-tête Bearer ignoré (cookie HttpOnly exigé)");

// --- Rafraîchissement : rotation et détection de rejeu --------------------------
const rt1 = pick(W, "restoapp_rt");
const r1 = await fetch(`${API}/auth/refresh`, { method: "POST", headers: { cookie: rt1 } });
const rt2 = pick(cookiesOf(r1), "restoapp_rt");
ok(r1.status === 200 && rt2 && rt2 !== rt1 && pick(cookiesOf(r1), "restoapp_at"), "rafraîchissement : nouveau jeton d'accès + rotation du jeton de rafraîchissement");
ok((await fetch(`${API}/auth/refresh`, { method: "POST", headers: { cookie: rt1 } })).status === 200, "ancien jeton toléré quelques secondes (requêtes simultanées)");
await db.authSession.update({ where: { id: access.sid }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
const replay = await fetch(`${API}/auth/refresh`, { method: "POST", headers: { cookie: rt1 } });
ok(replay.status === 401, "rejeu d'un ancien jeton de rafraîchissement refusé");
ok((await call(W, "/tables")).s === 401 && (await fetch(`${API}/auth/refresh`, { method: "POST", headers: { cookie: rt2 } })).status === 401, "rejeu détecté : toute la session est révoquée (accès + jeton courant)");
ok((await db.authSession.findUnique({ where: { id: access.sid } })).revokedReason === "refresh_token_reuse", "révocation motivée en base");

// --- Rafraîchissement silencieux au chargement ---------------------------------
const W2 = await login("awa", "1111");
const expired = jwt.sign({ sid: jwt.decode(pick(W2, "restoapp_at").split("=")[1]).sid, sv: 0, typ: "access" }, process.env.JWT_SECRET, { subject: access.sub, issuer: "restoapp", audience: "restoapp-api", expiresIn: -10 });
ok((await call(`restoapp_at=${expired}`, "/tables")).s === 401, "jeton d'accès expiré refusé par l'API");
const me = await call(`restoapp_at=${expired}; ${pick(W2, "restoapp_rt")}`, "/auth/me");
ok(me.user?.username === "awa" && pick(cookiesOf(me._r), "restoapp_at"), "/auth/me : session reprise grâce au jeton de rafraîchissement");

// --- RBAC ----------------------------------------------------------------------
const A = await login("admin", "0000"), K = await login("cuisine", "3333"), C = await login("caisse", "4444");
ok((await call(W2, "/admin/users")).s === 403, "serveur → gestion des utilisateurs : 403");
ok((await call(K, "/checkout/overview")).s === 403 && (await call(W2, "/checkout/overview")).s === 403, "cuisine / serveur → caisse : 403");
ok((await call(C, "/orders/x/status", { status: "READY" }, "PATCH")).s === 403, "caisse → statut cuisine : 403");
ok((await call(A, "/checkout/overview")).s === 200, "gérant : accès à tout");
const denied = await call(A, "/admin/audit-logs?action=ACCESS_DENIED");
ok(denied.items.some((l) => l.details.path === "/api/admin/users" && l.user?.role === "SERVEUR" && l.ipAddress), "refus d'accès journalisé (auteur, route, IP)");

// --- Gestion des comptes (gérant uniquement) -------------------------------------
ok((await call(A, "/admin/users", { name: "Fatou", username: "Fatou B", role: "SERVEUR" })).s === 400, "identifiant mal formé refusé");
ok((await call(A, "/admin/users", { name: "Doublon", username: "awa", role: "SERVEUR" })).error === "Cet identifiant est déjà utilisé", "identifiant en double refusé");
ok((await call(A, "/admin/users", { name: "X", username: "xx1", role: "ADMIN", pinHash: "x" })).s === 400, "champ inconnu (pinHash) refusé");
const created = await call(A, "/admin/users", { name: "Fatou", username: "Fatou.b", role: "SERVEUR", pin: "246813" });
ok(created.s === 201 && created.user.username === "fatou.b" && created.pin === "246813" && !("pinHash" in created.user), "collaborateur créé (identifiant normalisé, PIN renvoyé une fois)");
const stored = await db.user.findUnique({ where: { id: created.user.id } });
ok(/^\$2[aby]\$12\$/.test(stored.pinHash), "PIN haché par bcrypt (coût 12)");
const F = await login("fatou.b", "246813");
ok((await call(F, "/auth/me")).user?.role === "SERVEUR", "le nouveau collaborateur peut se connecter");
const sock = io(BASE, { transports: ["websocket"], extraHeaders: { cookie: F } });
await new Promise((r) => sock.on("connect", r));
const gone = new Promise((r) => sock.on("disconnect", r));
ok((await call(A, `/admin/users/${created.user.id}`, { isActive: false }, "PUT")).isActive === false, "collaborateur désactivé");
ok((await call(F, "/tables")).s === 401, "désactivation : accès refusé immédiatement");
ok((await Promise.race([gone, new Promise((r) => setTimeout(() => r("timeout"), 3000))])) === "io server disconnect", "désactivation : connexion temps réel coupée");
const inactive = await loginRaw("fatou.b", "246813", {}, "10.0.0.5");
ok(inactive.r.status === 401 && inactive.body.error === "Identifiants invalides", "compte désactivé : même message générique");
sock.close();

// --- Déconnexion -----------------------------------------------------------------
const C2 = await login("caisse", "4444");
const out = await fetch(`${API}/auth/logout`, { method: "POST", headers: { cookie: C2 } });
ok(out.status === 204 && /restoapp_at=;/.test(out.headers.getSetCookie().join(" ")), "déconnexion : cookies effacés");
ok((await call(C2, "/checkout/overview")).s === 401, "déconnexion : jeton d'accès encore valide en durée mais révoqué");

// --- Journal des connexions -----------------------------------------------------
const logins = await call(A, "/admin/audit-logs?action=LOGIN_SUCCESS&limit=50");
ok(logins.items.some((l) => l.details.username === "fatou.b" && l.ipAddress && l.user?.name === "Fatou"), "connexion réussie journalisée (utilisateur, IP)");
const failed = await call(A, "/admin/audit-logs?action=LOGIN_FAILED&limit=50");
const reasons = new Set(failed.items.map((l) => l.details.reason));
ok(["UNKNOWN_USER", "BAD_PIN", "INACTIVE"].every((r) => reasons.has(r)) && failed.items.every((l) => l.ipAddress), "échecs journalisés avec motif et IP (motif jamais renvoyé au client)");
const all = JSON.stringify(await call(A, "/admin/audit-logs?limit=100"));
ok(!all.includes("246813") && !all.includes('"9999"'), "aucun code PIN dans le journal");
ok((await call(A, "/admin/audit-logs?action=LOGOUT")).items.length >= 1 && (await call(A, "/admin/audit-logs?action=SESSION_REVOKED")).items.length >= 1, "déconnexions et révocations journalisées");

// --- Interface servie par le serveur (si compilée) ------------------------------
const page = await fetch(`${BASE}/login`);
if (page.status === 200 && (page.headers.get("content-type") ?? "").includes("text/html")) {
  const csp = page.headers.get("content-security-policy") ?? "";
  ok(csp.includes("script-src 'self'") && !csp.includes("unsafe-eval") && csp.includes("frame-ancestors 'none'"), "interface : CSP dédiée (scripts du site uniquement)");
  ok((await fetch(`${API}/health`)).headers.get("content-security-policy")?.includes("default-src 'none'"), "API : CSP la plus stricte conservée");
} else {
  console.log("· interface non compilée (client/dist absent) : vérification CSP ignorée");
}

// --- Anti force brute -----------------------------------------------------------
let last;
for (let i = 0; i < 6; i++) last = await loginRaw("issa", "0000", {}, "10.0.0.2");
ok(last.r.status === 429 && last.body.error === "Trop de tentatives : réessayez dans 5 minutes", "6e essai sur un identifiant → bloqué 5 min");
ok((await loginRaw("issa", "2222", {}, "10.0.0.3")).r.status === 429, "identifiant bloqué sur tous les appareils, même avec le bon PIN");
const lockedLog = await call(A, "/admin/audit-logs?action=LOGIN_LOCKED");
ok(lockedLog.items.some((l) => l.details.targetUsername === "issa"), "blocage journalisé");
const ghost = [];
for (let i = 0; i < 11; i++) ghost.push(await loginRaw(`inconnu${i}`, "1111", {}, "10.0.0.4"));
ok(ghost[9].r.status === 401 && ghost[10].r.status === 429 && ghost[10].body.error === "Trop de tentatives : réessayez dans 5 minutes", "11e échec depuis un même appareil (identifiants variés) → bloqué, message identique");
ok((await loginRaw("caisse", "4444", {}, "10.0.0.6")).r.status === 200, "un autre appareil n'est pas pénalisé");

await db.$disconnect();
console.log(failures ? `\n${failures} échec(s)` : "\nToutes les vérifications de connexion sont passées.");
process.exit(failures ? 1 : 0);
