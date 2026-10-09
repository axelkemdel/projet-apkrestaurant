/**
 * Correctifs de l'audit de sécurité, de bout en bout (base de démo fraîche, API redémarrée) :
 *
 *   npm run db:seed -w server && npm run dev -w server
 *   npm run test:hardening -w server
 *
 * Couvre : erreurs client → 4xx (jamais 500 ni détail SQL), dates et montants bornés,
 * images https seulement, rejeu de jeton de rafraîchissement vs secret forgé, déconnexion
 * exigeant une session prouvée, réinitialisation de son propre PIN, PIN générés à
 * 6 chiffres, journal d'audit (plats, catégories, tables), plafond des commandes QR par
 * table, CSP de l'interface.
 */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const BASE = "http://localhost:4000";
const API = `${BASE}/api`;
const db = new PrismaClient();

const cookiesOf = (r) => r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const pick = (cookie, name) => cookie.split("; ").find((c) => c.startsWith(`${name}=`)) ?? "";
async function login(username, pin, device) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(device && { "x-forwarded-for": device }) },
    body: JSON.stringify({ username, pin }),
  });
  if (r.status !== 200) throw new Error(`login ${username} → ${r.status}`);
  return cookiesOf(r);
}
async function call(cookie, path, body, method, headers = {}) {
  const r = await fetch(`${API}${path}`, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === "string" ? body : body && JSON.stringify(body),
  });
  const txt = await r.text();
  let j = {};
  try {
    j = txt ? JSON.parse(txt) : {};
  } catch {}
  return Array.isArray(j) ? Object.assign(j, { s: r.status }) : { s: r.status, ...j, _txt: txt };
}
let failures = 0;
const ok = (c, m) => {
  if (!c) failures++;
  console.log(c ? "✔" : "✘", m);
};

const admin = await login("admin", "0000", "10.9.0.1");

// --- Erreurs : jamais de 500 pour une faute du client ---------------------------
const badJson = await call(admin, "/admin/tables", "{ pas du json", "POST");
ok(badJson.s === 400 && badJson.code === "http.invalidData" && !/SyntaxError|at /.test(badJson._txt), "JSON illisible → 400 sans trace");
const huge = await call(admin, "/admin/tables", JSON.stringify({ zone: "x".repeat(200_000) }), "POST");
ok(huge.s === 413 && huge.code === "http.payloadTooLarge", "corps trop volumineux → 413");
ok((await call(admin, "/admin/audit-logs?from=2026-02-31")).s === 400, "date inexistante (31 février) refusée");
ok((await call(admin, "/admin/stats/daily?date=2026-13-01")).s === 400, "mois 13 refusé");
ok((await call(admin, "/admin/stats/daily?date=2026-03-01")).s === 200, "date valide acceptée");

// --- Montants bornés, images https ----------------------------------------------
const table = await db.table.findFirst({ where: { number: 1 } });
const pay = await call(admin, "/checkout/pay", { tableId: table.id, mode: "CASH", amount: 5_000_000_000 });
ok(pay.s === 400 && pay.code === "validation.amountTooLarge", "paiement : montant hors bornes refusé (400, pas d'erreur base)");
const item = await db.menuItem.findFirst({ where: { isArchived: false } });
const httpImg = await call(admin, `/admin/menu/${item.id}`, { imageUrl: "http://exemple.com/plat.jpg" }, "PUT");
ok(httpImg.s === 400 && httpImg.code === "validation.imageUrl", "image en http refusée");
ok((await call(admin, `/admin/menu/${item.id}`, { imageUrl: "https://exemple.com/plat.jpg" }, "PUT")).s === 200, "image en https acceptée");

// --- Journal d'audit étendu -------------------------------------------------------
const before = new Date();
await call(admin, `/admin/menu/${item.id}/toggle-availability`, { isAvailable: false }, "PATCH");
await call(admin, `/admin/menu/${item.id}`, { isAvailable: true, nameEn: `${item.nameEn} (new)` }, "PUT");
const cat = await call(admin, "/admin/categories", { nameFr: "Audit", nameEn: "Audit", station: "BAR" });
await call(admin, `/admin/categories/${cat.id}`, { station: "KITCHEN" }, "PUT");
await call(admin, `/admin/categories/${cat.id}`, undefined, "DELETE");
const tbl = await call(admin, "/admin/tables", { number: 777, capacity: 2, zone: "Audit" });
await call(admin, `/admin/tables/${tbl.id}`, { capacity: 6 }, "PUT");
await call(admin, `/admin/tables/${tbl.id}`, undefined, "DELETE");
const logs = await db.auditLog.findMany({ where: { timestamp: { gte: before } }, orderBy: { timestamp: "asc" } });
const of = (a) => logs.filter((l) => l.action === a);
ok(of("MENU_ITEM_UPDATED").some((l) => l.details.changes?.isAvailable?.to === false), "disponibilité d'un plat tracée");
ok(of("MENU_ITEM_UPDATED").some((l) => l.details.changes?.nameEn && l.details.changes?.isAvailable), "modification d'un plat tracée (ancien → nouveau)");
ok(of("MENU_CATEGORY_CHANGED").map((l) => l.details.op).join() === "created,updated,deleted", "catégorie : création, modification, suppression tracées");
ok(of("TABLE_CHANGED").map((l) => l.details.op).join() === "created,updated,deleted" && of("TABLE_CHANGED")[1].details.changes.capacity.to === 6, "plan de salle tracé");

// --- PIN générés à 6 chiffres -----------------------------------------------------
const created = await call(admin, "/admin/users", { name: "Test Audit", username: "test.audit", role: "SERVEUR" });
ok(created.s === 201 && /^\d{6}$/.test(created.pin), `PIN généré à 6 chiffres (${created.pin?.length} chiffres)`);

// --- Jeton de rafraîchissement : secret forgé ≠ rejeu --------------------------------
const victim = await login("awa", "1111", "10.9.0.2");
const rt = pick(victim, "restoapp_rt").slice("restoapp_rt=".length);
const sid = rt.split(".")[0];
const forged = `restoapp_rt=${sid}.${"A".repeat(43)}`;
ok((await call(forged, "/auth/refresh", {})).s === 401, "secret forgé refusé");
ok((await call(victim, "/auth/me")).user?.username === "awa", "…sans couper la session de la victime");
await call(forged, "/auth/logout", {});
ok((await call(victim, "/auth/me")).user?.username === "awa", "déconnexion avec un secret forgé : session de la victime intacte");
// Le vrai rejeu (ancien jeton authentique après rotation) révoque toujours la session
const rotated = await fetch(`${API}/auth/refresh`, { method: "POST", headers: { cookie: victim } });
const fresh = cookiesOf(rotated);
await db.authSession.update({ where: { id: sid }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
ok((await call(victim, "/auth/refresh", {})).s === 401, "ancien jeton rejoué après la fenêtre de tolérance → refusé");
ok((await db.authSession.findUnique({ where: { id: sid } })).revokedReason === "refresh_token_reuse", "…et session révoquée (vol détecté)");
ok((await call(fresh, "/auth/me")).user === null, "…y compris pour le détenteur du nouveau jeton");

// --- Réinitialiser son propre PIN ferme ses AUTRES sessions -------------------------
const adminElsewhere = await login("admin", "0000", "10.9.0.3");
const me = await call(admin, "/auth/me");
const reset = await call(admin, `/admin/users/${me.user.id}/pin`, { pin: "0000" }, "PUT");
ok(reset.s === 200, "PIN du gérant réinitialisé par lui-même");
ok((await call(admin, "/auth/me")).user?.role === "ADMIN", "…session de cet appareil conservée");
ok((await call(adminElsewhere, "/admin/users")).s === 401, "…autres appareils déconnectés");

// --- Portail QR : plafond de bons en attente par table, quelle que soit l'IP -----------
const dish = await db.menuItem.findFirst({ where: { isAvailable: true, isArchived: false, options: { equals: {} } } })
  ?? (await db.menuItem.findFirst({ where: { isAvailable: true, isArchived: false } }));
const t2 = await db.table.findFirst({ where: { number: 2 } });
const statuses = [];
for (let i = 0; i < 7; i++) {
  const r = await call(null, "/public/orders", { token: t2.qrToken, items: [{ menuItemId: dish.id, quantity: 1 }] }, "POST", { "x-forwarded-for": `10.8.0.${i + 1}` });
  statuses.push(r.s);
}
ok(statuses.filter((s) => s === 201).length === 5 && statuses.slice(5).every((s) => s === 429), `5 bons clients en attente maximum par table, IP tournantes comprises (${statuses.join(",")})`);

// --- En-têtes ----------------------------------------------------------------------
const page = await fetch(`${BASE}/`);
const csp = page.headers.get("content-security-policy") ?? "";
ok(page.status !== 200 || (/connect-src 'self'(;|$)/.test(csp) && !/ws:|wss:/.test(csp)), "CSP interface : connexions vers le site uniquement");

await db.$disconnect();
if (failures) {
  console.error(`${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("Toutes les vérifications de durcissement sont passées.");
