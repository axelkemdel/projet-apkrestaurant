/**
 * Vérifications multilingues de bout en bout (API + Socket.io) sur une base de démo fraîche.
 *
 *   npm run db:seed -w server && npm run dev -w server
 *   npm run test:i18n -w server
 *
 * Couvre : carte bilingue, bon pris en anglais (noms / options figés FR+EN, notes
 * rapides codifiées), erreurs traduites selon Accept-Language (y compris noms de
 * plats et messages Zod), langue des accusés Socket.io, ticket bilingue, stats et
 * journal d'audit bilingues.
 */
import { io } from "socket.io-client";
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
const W = await login("Awa", "1111"), K = await login("Cuisine", "3333"), C = await login("Caisse", "4444"), A = await login("Admin", "0000");
const EN = { "accept-language": "en" };
const menu = (await call(W, "/menu")).flatMap(c => c.items);
const chicken = menu.find(i => i.nameFr === "Poulet braisé"), steak = menu.find(i => i.nameFr.startsWith("Entrecôte"));
ok(chicken.nameEn === "Grilled chicken" && chicken.options.sides[1].en === "Fries", "carte bilingue (nameEn, options {fr,en})");
const tables = await call(W, "/tables");
const o = await call(W, "/orders", { tableId: tables[0].id, language: "EN", items: [
  { menuItemId: chicken.id, quantity: 1, side: "Frites", extras: ["Oignons frits"], quickNotes: ["NO_ONION", "EXTRA_SPICY"], notes: "well cooked please" },
  { menuItemId: steak.id, quantity: 1, cooking: "Saignant" } ] });
ok(o.language === "EN" && o.items[0].nameEn === "Grilled chicken" && o.items[0].nameFr === "Poulet braisé", "bon EN avec noms figés FR/EN");
ok(o.items[0].modifiers.side.en === "Fries" && o.items[0].modifiers.side.fr === "Frites" && o.items[1].modifiers.cooking.en === "Rare", "options figées en deux langues");
ok(JSON.stringify(o.items[0].quickNotes) === '["NO_ONION","EXTRA_SPICY"]', "notes rapides codifiées");
ok((await call(W, "/orders", { tableId: tables[0].id, items: [{ menuItemId: chicken.id, quantity: 1, quickNotes: ["HACK"] }] })).s === 400, "note rapide inconnue refusée");
const e1 = await call(W, "/orders", { tableId: tables[0].id, items: [{ menuItemId: steak.id, quantity: 1, cooking: "Raw" }] }, "POST", EN);
ok(e1.error === "Invalid cooking option for “Grilled rib steak”" && e1.code === "order.invalidCooking", "erreur traduite EN avec nom du plat EN : " + e1.error);
const e2 = await call(W, "/orders", { tableId: tables[0].id, items: [{ menuItemId: steak.id, quantity: 1, cooking: "Raw" }] });
ok(e2.error === "Cuisson invalide pour « Entrecôte grillée »", "même erreur en FR : " + e2.error);
ok((await call(W, "/orders", { items: [] }, "POST", EN)).error === "The order is empty", "message Zod personnalisé traduit");
ok((await call(null, "/tables", null, "GET", EN)).error === "Authentication required", "401 traduit");
ok((await call(W, "/nope", null, "GET", EN)).error === "Route not found", "404 traduit");
const s = io("http://localhost:4000", { transports: ["websocket"], extraHeaders: { cookie: K }, auth: { lang: "en" } });
await new Promise(r => s.on("connect", r));
ok((await s.emitWithAck("order_status", { orderId: o.id, status: "SERVED" })).error === "Invalid transition: PENDING → SERVED", "erreur socket en EN");
s.emit("set_lang", "fr"); await new Promise(r => setTimeout(r, 100));
ok((await s.emitWithAck("order_status", { orderId: o.id, status: "SERVED" })).error.startsWith("Transition impossible"), "set_lang → FR");
s.close();
for (const st of ["PREPARING", "READY", "SERVED"]) await call(K, `/orders/${o.id}/status`, { status: st }, "PATCH");
const pay = await call(C, "/checkout/pay", { tableId: tables[0].id, mode: "CARD", amount: o.totalAmount });
const rec = await call(C, `/checkout/receipt/${pay.paymentId}`);
ok(rec.language === "EN" && rec.lines[0].nameEn === "Grilled chicken" && rec.restaurant.footerEn, "ticket : langue client EN + lignes bilingues");
const top = await call(A, "/admin/stats/top-items");
ok(top.byQuantity[0].nameEn && top.byQuantity[0].nameFr, "top ventes bilingue");
const daily = await call(A, "/admin/stats/daily");
ok(daily.orders.english === 1, "KPI : bons pris en anglais = " + daily.orders.english);
const fd = new FormData(); fd.set("nameFr", "Brochettes"); fd.set("nameEn", "Skewers"); fd.set("price", "3000"); fd.set("categoryId", menu[0].categoryId);
fd.set("options", JSON.stringify({ cooking: [{ fr: "À point", en: "Medium" }], extras: [{ fr: "Piment", en: "Chili", price: 0 }] }));
const created = await call(A, "/admin/menu", fd);
ok(created.s === 201 && created.nameEn === "Skewers" && created.options.cooking[0].en === "Medium", "création plat bilingue");
const bad = new FormData(); bad.set("nameFr", "X"); bad.set("price", "1"); bad.set("categoryId", menu[0].categoryId);
ok((await call(A, "/admin/menu", bad, "POST", EN)).error === "Name required", "nom anglais obligatoire (message EN)");
const cat = await call(A, "/admin/categories", { nameFr: "Grillades", nameEn: "Grills", station: "KITCHEN" });
ok(cat.nameEn === "Grills", "catégorie bilingue");
const logs = await call(A, "/admin/audit-logs?action=MENU_ITEM_CREATED");
ok(logs.items[0].details.nameEn === "Skewers", "audit : noms FR/EN");

console.log(failures ? `\n${failures} échec(s)` : "\nToutes les vérifications multilingues sont passées.");
process.exit(failures ? 1 : 0);
