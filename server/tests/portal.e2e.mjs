/**
 * Portail client (QR code) de bout en bout : API publique + Socket.io, sur une base de démo fraîche.
 *
 *   npm run db:seed -w server && npm run dev -w server
 *   npm run test:portal -w server
 *
 * Couvre : jeton secret (numéro seul refusé, jeton absent des API du personnel),
 * commande client (prix recalculés, schéma strict, limites), diffusion temps réel
 * (cuisine, serveurs, clients de la table uniquement), appel serveur / addition
 * (anti-répétition, prise en compte), avis (un par bon, sur un bon réel), plan de
 * salle du gérant (CRUD, régénération du QR code + déconnexion, journal d'audit).
 */
import { io } from "socket.io-client";

const BASE = "http://localhost:4000";
const API = `${BASE}/api`;
const users = await fetch(`${API}/auth/users`).then((r) => r.json());
const uid = (n) => users.find((u) => u.name.startsWith(n)).id;
async function login(n, pin) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: uid(n), pin }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie) throw new Error("login failed " + n);
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
  return Array.isArray(j) ? Object.assign(j, { s: r.status }) : { s: r.status, ...j };
}
const pub = (path, body, method, headers) => call(null, `/public${path}`, body, method, headers);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Attend un événement (ou échoue au bout de `ms`). */
const next = (socket, event, filter = () => true, ms = 3000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, h);
      resolve(null);
    }, ms);
    const h = (p) => {
      if (!filter(p)) return;
      clearTimeout(timer);
      socket.off(event, h);
      resolve(p);
    };
    socket.on(event, h);
  });
const connect = (opts, ns = "") =>
  new Promise((resolve) => {
    const s = io(`${BASE}${ns}`, { transports: ["websocket"], ...opts });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => resolve(Object.assign(s, { error: e.message })));
  });

let failures = 0;
const ok = (c, m) => {
  if (!c) failures++;
  console.log(c ? "✔" : "✘", m);
};

const A = await login("Admin", "0000"), W = await login("Awa", "1111"), K = await login("Cuisine", "3333"), C = await login("Caisse", "4444");

// --- Jeton secret ------------------------------------------------------------
const admin = await call(A, "/admin/tables");
ok(admin.restaurant?.name && admin.tables.length >= 2 && /^[0-9a-f-]{36}$/.test(admin.tables[0].qrToken), "gérant : tables avec jeton QR (UUID)");
// Tables libres (la base de démo a déjà des bons sur certaines tables)
const [t1, t2, t3, t4] = admin.tables.filter((tb) => tb.status === "FREE");
const staffTables = await call(W, "/tables");
ok(staffTables.every((tb) => !("qrToken" in tb)), "serveur : jeton QR jamais exposé");
const overview = await call(C, "/checkout/overview");
ok(overview.s === 200 && overview.tables.every((tb) => !("qrToken" in tb)), "caisse : jeton QR jamais exposé");
ok((await pub(`/table/${t1.number}`)).s === 404, "numéro de table seul refusé (devinable)");
ok((await pub("/table/00000000-0000-4000-8000-000000000000", null, "GET", { "accept-language": "en" })).error.startsWith("Invalid or expired QR code"), "jeton inconnu : 404 traduit");
ok((await pub("/table/not-a-token%27%3B--")).s === 404, "jeton malformé refusé");

const portal = await pub(`/table/${t1.qrToken}`);
ok(portal.s === 200 && portal.table.number === t1.number && portal.menu.length > 0 && portal.ordering === true, "portail : table + carte bilingue");
ok(!("id" in portal.table) && !("qrToken" in portal.table), "portail : pas d'identifiant interne de table");
const items = portal.menu.flatMap((c) => c.items);
const simple = items.find((i) => i.isAvailable && !i.options?.cooking && !i.options?.extras);
const steak = items.find((i) => i.options?.cooking?.length);
const withExtra = items.find((i) => i.options?.extras?.some((e) => e.price > 0));

// --- Temps réel : sockets personnel + clients de deux tables -------------------
const kds = await connect({ extraHeaders: { cookie: K } });
const floor = await connect({ extraHeaders: { cookie: W } });
const cashier = await connect({ extraHeaders: { cookie: C } });
const guest1 = await connect({ auth: { token: t1.qrToken } }, "/public");
const guest1b = await connect({ auth: { token: t1.qrToken } }, "/public");
const guest2 = await connect({ auth: { token: t2.qrToken } }, "/public");
ok(guest1.connected && guest2.connected, "socket /public : connexion avec le jeton de la table");
const intruder = await connect({ auth: { token: "nope" } }, "/public");
ok(!intruder.connected && intruder.error === "invalid_qr", "socket /public : jeton invalide refusé");
const anonStaff = await connect({});
ok(!anonStaff.connected, "espace du personnel toujours fermé sans session");

// --- Commande client ----------------------------------------------------------
const extra = withExtra.options.extras.find((e) => e.price > 0);
const orderBody = {
  token: t1.qrToken,
  language: "EN",
  customerNote: "Birthday!",
  items: [
    { menuItemId: simple.id, quantity: 2, quickNotes: ["NO_ONION"], notes: "no ice" },
    { menuItemId: withExtra.id, quantity: 1, extras: [extra.fr] },
  ],
};
ok((await pub("/orders", { ...orderBody, items: [{ ...orderBody.items[0], unitPrice: 1 }] })).s === 400, "prix envoyé par le client refusé (schéma strict)");
ok((await pub("/orders", { ...orderBody, tableId: t2.id })).s === 400, "table imposée par le client refusée");
ok((await pub("/orders", { ...orderBody, items: [{ menuItemId: simple.id, quantity: 21 }] })).s === 400, "quantité > 20 refusée");
ok((await pub("/orders", { ...orderBody, items: [] }, "POST", { "accept-language": "en" })).error === "The order is empty", "commande vide refusée (EN)");

const kdsNew = next(kds, "new_order", (o) => o.source === "CUSTOMER");
const floorNew = next(floor, "new_order", (o) => o.source === "CUSTOMER");
const g1 = next(guest1, "order_status_changed");
const g1b = next(guest1b, "order_status_changed");
const g2 = next(guest2, "order_status_changed", () => true, 800);
const g1Table = next(guest1, "table_updated");
const created = await pub("/orders", orderBody);
const expected = simple.price * 2 + withExtra.price + extra.price;
ok(created.s === 201 && created.totalAmount === expected, `commande client : total recalculé côté serveur (${created.totalAmount})`);
const kOrder = await kdsNew;
ok(kOrder && kOrder.server === null && kOrder.table.number === t1.number && kOrder.language === "EN", "cuisine : bon client reçu (source CUSTOMER, sans serveur)");
ok(kOrder?.items[0].quickNotes[0] === "NO_ONION" && kOrder?.customerNote === "Birthday!", "cuisine : notes rapides et note du client");
ok(Boolean(await floorNew), "serveurs : bon client reçu");
const pOrder = await g1;
ok(pOrder && pOrder.status === "PENDING" && !("server" in pOrder) && !("table" in pOrder), "client : bon reçu en direct (vue épurée)");
ok(Boolean(await g1b), "deuxième téléphone de la même table : même session");
ok((await g2) === null, "autre table : rien reçu (isolation)");
ok((await g1Table)?.status === "OCCUPIED", "client : table passée OCCUPIED");

// Rejoindre la session en cours
const rejoin = await pub(`/table/${t1.qrToken}`);
ok(rejoin.orders.length === 1 && rejoin.orders[0].id === created.id && rejoin.table.status === "OCCUPIED", "rechargement : session de la table retrouvée");

// Bon pris par le serveur sur la même table : visible du client
const gStaff = next(guest1, "order_status_changed", (o) => o.source === "STAFF");
const staffOrder = await call(W, "/orders", { tableId: kOrder.table.id, items: [{ menuItemId: steak.id, quantity: 1, cooking: steak.options.cooking[0].fr }] });
ok(staffOrder.s === 201 && (await gStaff)?.id === staffOrder.id, "bon saisi par le serveur visible du client");

// Progression : cuisine → client
for (const status of ["PREPARING", "READY", "SERVED"]) {
  const g = next(guest1, "order_status_changed", (o) => o.id === created.id && o.status === status);
  await call(K, `/orders/${created.id}/status`, { status }, "PATCH");
  ok(Boolean(await g), `client : statut ${status} reçu en direct`);
}

// --- Appel serveur / addition -------------------------------------------------
const alert = next(floor, "server_alert");
const gCall = next(guest1, "table_updated", (p) => p.callRequestedAt);
const c1 = await pub(`/table/${t1.qrToken}/call-server`, {});
ok(c1.s === 200 && c1.notified === true, "appel serveur enregistré");
const a = await alert;
ok(a && a.number === t1.number && a.kind === "CALL", "serveurs : alerte server_alert");
ok(Boolean(await gCall), "client : appel visible (table_updated)");
const noAlert = next(floor, "server_alert", () => true, 800);
const c2 = await pub(`/table/${t1.qrToken}/call-server`, {});
ok(c2.notified === false && (await noAlert) === null, "appel répété dans la minute : pas de nouvelle alerte");
ok((await call(W, "/tables")).find((tb) => tb.number === t1.number).callRequestedAt, "plan de salle serveur : appel en attente");

ok((await pub(`/table/${t3.qrToken}/request-bill`, {})).s === 409, "addition sans commande refusée");
const billAlert = next(cashier, "request_bill");
ok((await pub(`/table/${t1.qrToken}/request-bill`, {})).notified === true, "demande d'addition");
ok((await billAlert)?.kind === "BILL", "caisse : alerte request_bill");

ok((await call(K, `/tables/${kOrder.table.id}/requests/clear`, { kind: "CALL" })).s === 403, "cuisine : prise en compte interdite");
const cleared = next(floor, "table_alert_cleared");
const gCleared = next(guest1, "table_updated", (p) => p.callRequestedAt === null);
const clr = await call(W, `/tables/${kOrder.table.id}/requests/clear`, { kind: "CALL" });
ok(clr.s === 200 && clr.callRequestedAt === null && clr.billRequestedAt, "serveur : appel pris en compte (addition toujours demandée)");
ok((await cleared)?.kind === "CALL" && Boolean(await gCleared), "prise en compte diffusée (personnel + client)");

// --- Avis ---------------------------------------------------------------------
ok((await pub("/reviews", { token: t3.qrToken, rating: 5 })).s === 409, "avis sans commande refusé");
ok((await pub("/reviews", { token: t1.qrToken, rating: 6 })).s === 400, "note hors 1–5 refusée");
const foreign = await call(W, "/orders", { tableId: t4.id, items: [{ menuItemId: simple.id, quantity: 1 }] });
ok((await pub("/reviews", { token: t1.qrToken, orderId: foreign.id, rating: 5 })).s === 404, "avis sur un bon d'une autre table refusé");
const review = await pub("/reviews", { token: t1.qrToken, orderId: created.id, rating: 4, comment: "Great food", language: "EN" });
ok(review.s === 201 && review.rating === 4, "avis enregistré");
ok((await pub("/reviews", { token: t1.qrToken, orderId: created.id, rating: 1 })).s === 409, "un seul avis par bon");
ok((await pub(`/table/${t1.qrToken}`)).reviewedOrderIds.includes(created.id), "portail : bon déjà noté signalé");
const reviews = await call(A, "/admin/reviews");
ok(reviews.count === 1 && reviews.average === 4 && reviews.items[0].comment === "Great food" && reviews.items[0].table === t1.number, "gérant : avis (moyenne, commentaire, table)");
ok((await call(W, "/admin/reviews")).s === 403, "avis réservés au gérant");

// --- Fin de repas : table réglée → session close côté client -----------------
await call(K, `/orders/${staffOrder.id}/status`, { status: "PREPARING" }, "PATCH");
await call(K, `/orders/${staffOrder.id}/status`, { status: "READY" }, "PATCH");
await call(K, `/orders/${staffOrder.id}/status`, { status: "SERVED" }, "PATCH");
const gFree = next(guest1, "table_updated", (p) => p.status === "FREE");
const bill = await call(C, `/checkout/table/${kOrder.table.id}`);
const pay = await call(C, "/checkout/pay", { tableId: kOrder.table.id, mode: "CASH", amount: bill.totals.remaining, amountReceived: bill.totals.remaining + 1000 });
ok(pay.s === 201 || pay.s === 200, "addition réglée en caisse");
const free = await gFree;
ok(free && free.billRequestedAt === null && free.callRequestedAt === null, "client : table libérée, demandes effacées");
const after = await pub(`/table/${t1.qrToken}`);
ok(after.orders.length === 0 && after.table.status === "FREE", "nouvelle session vierge pour les clients suivants");

// --- Plan de salle du gérant ---------------------------------------------------
ok((await call(W, "/admin/tables")).s === 403, "plan de salle réservé au gérant");
ok((await call(A, "/admin/tables", { number: t1.number })).s === 409, "numéro de table en double refusé");
const nt = await call(A, "/admin/tables", { number: 99, capacity: 2, zone: "Terrasse" });
ok(nt.s === 201 && nt.deletable && nt.qrToken, "table créée avec son QR code");
ok((await call(A, `/admin/tables/${nt.id}`, { capacity: 6 }, "PUT")).capacity === 6, "table modifiée");
ok((await call(A, `/admin/tables/${kOrder.table.id}`, null, "DELETE")).s === 409, "table avec historique non supprimable");
ok((await call(A, `/admin/tables/${nt.id}`, null, "DELETE")).s === 204, "table sans historique supprimée");

const guest2Gone = next(guest2, "disconnect");
const regen = await call(A, `/admin/tables/${t2.id}/regenerate-qr`, {});
ok(regen.s === 200 && regen.qrToken !== t2.qrToken, "nouveau QR code généré");
ok((await guest2Gone) === "io server disconnect", "clients connectés avec l'ancien QR code déconnectés");
ok((await pub(`/table/${t2.qrToken}`)).s === 404, "ancien QR code invalide");
ok((await pub(`/table/${regen.qrToken}`)).s === 200, "nouveau QR code valide");
const logs = await call(A, "/admin/audit-logs?action=TABLE_QR_REGENERATED");
ok(logs.items?.[0]?.details.table === t2.number, "régénération tracée au journal d'audit");

// --- Débit limité ------------------------------------------------------------
let limited = 0;
for (let i = 0; i < 9; i++) {
  const r = await pub("/orders", { token: t3.qrToken, items: [{ menuItemId: simple.id, quantity: 1 }] });
  if (r.s === 429) limited++;
}
ok(limited >= 1, `anti-abus : commandes limitées par table et appareil (${limited} refusée(s))`);

[kds, floor, cashier, guest1, guest1b, guest2, intruder, anonStaff].forEach((s) => s.close());
await wait(50);
console.log(failures ? `\n${failures} échec(s)` : "\nToutes les vérifications du portail client sont passées.");
process.exit(failures ? 1 : 0);
