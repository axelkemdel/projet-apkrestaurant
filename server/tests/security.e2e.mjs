/**
 * Vérifications de sécurité de bout en bout (API + Socket.io) sur une base de démo.
 *
 *   npm run db:seed -w server          # base de démo fraîche (le test modifie des données)
 *   npm run dev -w server              # API sur :4000
 *   npm run test:security -w server
 *
 * Couvre : cookie HttpOnly/SameSite/Secure, helmet, CORS, anti-CSRF, Zod strict
 * (corps, paramètres, requêtes, événements socket), handshake Socket.io, remises
 * plafonnées, upload (MIME, signature, nom aléatoire), anti force brute, journal
 * d'audit (contenu, accès, trigger en ajout seul), expiration par inactivité.
 */
import { io } from "socket.io-client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const FIXTURE = fileURLToPath(new URL("./fixture-dish.png", import.meta.url));
const API = "http://localhost:4000/api";
async function loginRaw(n, pin, extra = {}) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: n.toLowerCase(), pin, ...extra }) });
  return { r, body: await r.json().catch(() => ({})), cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}
async function login(n, pin) { const { cookie } = await loginRaw(n, pin); if (!cookie) throw new Error("login failed " + n); return cookie; }
async function call(cookie, path, body, method, headers = {}) {
  const isForm = body instanceof FormData;
  const r = await fetch(`${API}${path}`, { method: method ?? (body ? "POST" : "GET"), headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}), ...headers }, body: isForm ? body : body && JSON.stringify(body) });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {}
  return Array.isArray(j) ? Object.assign(j, { s: r.status }) : { s: r.status, ...j, _h: r.headers };
}

let failures = 0;
const ok = (c, m) => { if (!c) failures++; console.log(c ? "✔" : "✘", m); };
const L = await loginRaw("Admin", "0000");
const sc = L.r.headers.getSetCookie();
ok(sc.length === 2 && sc.every((c) => /HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && /Secure/i.test(c)), "cookies (accès + rafraîchissement) HttpOnly+SameSite=Strict+Secure");
ok(!("token" in L.body), "aucun jeton dans le corps JSON");
const A = L.cookie;
const staff = await call(A, "/admin/users");
const uid = (n) => staff.find((u) => u.name.startsWith(n)).id;
const W = await login("Awa", "1111"), K = await login("Cuisine", "3333"), C = await login("Caisse", "4444");
ok((await call(null, "/tables", null, "GET", { authorization: "Bearer x" })).s === 401, "Bearer refusé, cookie requis");
ok((await call(A, "/auth/me")).user?.role === "ADMIN", "/me via cookie");
const h = (await call(A, "/auth/me"))._h;
ok(h.get("content-security-policy")?.includes("default-src 'none'") && h.get("x-content-type-options") === "nosniff" && !h.get("x-powered-by"), "en-têtes helmet");
const evil = await fetch(`${API}/auth/me`, { headers: { origin: "https://evil.example", cookie: A } });
ok(!evil.headers.get("access-control-allow-origin"), "CORS : origine inconnue sans ACAO");
ok((await call(A, "/admin/categories", { nameFr: "X", nameEn: "X", station: "BAR" }, "POST", { origin: "https://evil.example" })).s === 403, "CSRF : POST d'une origine étrangère refusé");
ok((await loginRaw("Awa", "1111", { admin: true })).r.status === 400, "Zod strict : champ inconnu au login refusé");
ok((await call(A, "/checkout/table/..%2F..%2Fetc")).s === 400, "paramètre d'URL invalide refusé (400)");
ok((await call(A, "/admin/stats/top-items?period=year")).s === 400, "query invalide refusée");
// Sockets
const noAuth = io("http://localhost:4000", { transports: ["websocket"] });
ok(await new Promise(r => { noAuth.on("connect_error", e => r(e.message === "Session expirée")); noAuth.on("connect", () => r(false)); }), "socket sans cookie refusé au handshake");
noAuth.close();
const evilSock = io("http://localhost:4000", { transports: ["websocket"], extraHeaders: { cookie: K, origin: "https://evil.example" } });
ok(await new Promise(r => { evilSock.on("connect_error", () => r(true)); evilSock.on("connect", () => r(false)); setTimeout(() => r(true), 2000); }), "socket d'une origine étrangère refusé");
evilSock.close();
const ks = io("http://localhost:4000", { transports: ["websocket"], extraHeaders: { cookie: K } });
await new Promise(r => ks.on("connect", r)); ok(true, "socket cuisine authentifié par cookie");
ok(/invalides|Identifiant/.test((await ks.emitWithAck("order_status", { orderId: "x", status: "PAID", extra: 1 })).error), "payload socket validé par Zod");
// Annulation auditée
const menu = (await call(W, "/menu")).flatMap(c => c.items); const it = n => menu.find(i => i.nameFr.startsWith(n)).id;
const tables = await call(W, "/tables");
const o = await call(W, "/orders", { tableId: tables[0].id, items: [{ menuItemId: it("Poulet"), quantity: 1, side: "Riz" }] });
ok((await ks.emitWithAck("order_status", { orderId: o.id, status: "CANCELLED" })).ok, "annulation via socket");
// Remises
const o2 = await call(W, "/orders", { tableId: tables[1].id, items: [{ menuItemId: it("Entrecôte"), quantity: 2 }, { menuItemId: it("Bissap"), quantity: 2 }] });
const T2 = tables[1].id; // total 18400
let d = await call(C, "/checkout/discount", { tableId: T2, kind: "PERCENT", value: 10, reason: "Attente trop longue" });
ok(d.s === 201 && d.amount === 1840, `remise caissier 10 % = ${d.amount}`);
d = await call(C, "/checkout/discount", { tableId: T2, kind: "AMOUNT", value: 2000, reason: "Geste" });
ok(d.s === 403, "plafond caissier 15 % cumulé : " + d.error);
ok((await call(C, "/checkout/discount", { tableId: T2, kind: "AMOUNT", value: 500, reason: "" })).s === 400, "motif obligatoire");
const bill = await call(C, `/checkout/table/${T2}`);
ok(bill.totals.discounted === 1840 && bill.totals.remaining === 16560, `solde après remise ${bill.totals.remaining}`);
const pay = await call(C, "/checkout/pay", { tableId: T2, mode: "CASH", amount: 10000, amountReceived: 10000 });
d = await call(A, "/checkout/discount", { tableId: T2, kind: "AMOUNT", value: 6560, reason: "Repas offert par la direction" });
ok(d.s === 201 && d.closed && !d.tableReleased, "remise gérant soldant l'addition (bon encore en cuisine : table libérée au service)");
const rec = await call(C, `/checkout/receipt/${pay.paymentId}`);
ok(rec.totals.discounted === 1840 && rec.discounts.length === 1 && rec.totals.remainingAfter === 6560, "ticket : remise antérieure affichée");
// Prix, PIN, upload
const entrecote = (await call(A, "/admin/menu")).flatMap(c => c.items).find(i => i.nameFr.startsWith("Entrecôte"));
const fd = new FormData(); fd.set("price", "9000");
ok((await call(A, `/admin/menu/${entrecote.id}`, fd, "PUT")).price === 9000, "prix modifié");
const svg = new FormData(); svg.set("image", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "x.svg");
ok((await call(A, `/admin/menu/${entrecote.id}`, svg, "PUT")).s === 400, "MIME image/svg+xml refusé");
const lie = new FormData(); lie.set("image", new Blob([readFileSync(FIXTURE)], { type: "image/jpeg" }), "../../../evil.jpg");
ok((await call(A, `/admin/menu/${entrecote.id}`, lie, "PUT")).s === 400, "PNG déclaré JPEG refusé (signature ≠ MIME)");
const good = new FormData(); good.set("image", new Blob([readFileSync(FIXTURE)], { type: "image/png" }), "../../../../etc/passwd.png");
const up = await call(A, `/admin/menu/${entrecote.id}`, good, "PUT");
ok(/^\/uploads\/dishes\/[0-9a-f-]{36}\.png$/.test(up.imageUrl), "nom de fichier aléatoire (traversal ignoré) " + up.imageUrl);
ok((await call(A, `/admin/users/${uid("Issa")}/pin`, { pin: "2222" }, "PUT")).s === 200, "PIN réinitialisé");
// Brute force
let last; for (let i = 0; i < 6; i++) last = await loginRaw("Issa", "9999");
ok(last.r.status === 429, "6e essai de PIN → 429 : " + last.body.error);
await new Promise(r => setTimeout(r, 300));
// Journal
const logs = await call(A, "/admin/audit-logs?limit=20");
const acts = logs.items.map(l => l.action);
ok(["ORDER_CANCELLED", "DISCOUNT_APPLIED", "MENU_PRICE_CHANGED", "PIN_RESET", "LOGIN_LOCKED"].every(a => acts.includes(a)), "journal : " + [...new Set(acts)].join(", "));
const cancel = logs.items.find(l => l.action === "ORDER_CANCELLED");
ok(cancel.user?.name === "Cuisine" && cancel.ipAddress && cancel.details.amount === o.totalAmount, `annulation tracée (auteur ${cancel.user?.name}, IP ${cancel.ipAddress})`);
const price = logs.items.find(l => l.action === "MENU_PRICE_CHANGED");
ok(price.details.oldPrice === 8500 && price.details.newPrice === 9000, "prix ancien → nouveau tracé");
ok(!JSON.stringify(logs).includes('"2222"'), "PIN jamais journalisé");
ok((await call(C, "/admin/audit-logs")).s === 403, "journal réservé au gérant");
ok((await call(A, "/admin/audit-logs?action=PIN_RESET")).items.every(l => l.action === "PIN_RESET"), "filtre par action");
const prisma = new PrismaClient();
try { await prisma.$executeRawUnsafe('DELETE FROM "AuditLog"'); ok(false, "DELETE autorisé ?!"); }
catch (e) { ok(/ajout seul/.test(String(e.message)), "trigger : DELETE sur AuditLog refusé en base"); }
finally { await prisma.$disconnect(); }
// Inactivité : dernière activité de la session repoussée de 31 min en base
const sidOf = (cookie) => jwt.decode(cookie.match(/restoapp_at=([^;]+)/)[1]).sid;
const C2 = await login("Caisse", "4444"), K2 = await login("Cuisine", "3333");
const db = new PrismaClient();
const past = new Date(Date.now() - 31 * 60_000);
await db.authSession.updateMany({ where: { id: { in: [sidOf(C2), sidOf(K2)] } }, data: { lastUsedAt: past } });
await db.$disconnect();
ok((await call(C2, "/admin/stats/daily")).error === "Session expirée après inactivité" && (await call(C2, "/auth/me")).user === null, "session expirée après 30 min d'inactivité");
ok((await call(K2, "/auth/me")).user?.role === "CUISINE", "écran cuisine exempté (affichage permanent)");
const logout = await fetch(`${API}/auth/logout`, { method: "POST", headers: { cookie: C } });
const cleared = logout.headers.getSetCookie().join(" ");
ok(/restoapp_at=;/.test(cleared) && /restoapp_rt=;/.test(cleared), "déconnexion : cookies effacés");
ok((await call(C, "/checkout/overview")).s === 401, "déconnexion : jeton d'accès révoqué côté serveur");
ks.close();

console.log(failures ? `\n${failures} échec(s)` : "\nToutes les vérifications de sécurité sont passées.");
process.exit(failures ? 1 : 0);
