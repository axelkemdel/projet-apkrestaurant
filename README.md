# RestoApp — POS & KDS temps réel pour restaurants

Application de gestion des commandes : prise de commande par les serveurs (tablette / mobile), écran cuisine & bar (KDS) en temps réel, caisse et tableau de bord gérant.

> **Étape 1** : schéma de BDD, API Express + Socket.io (`new_order`), Vue Serveur et Vue Cuisine.
> **Module 2** : Caisse — additions par table, addition partagée (parts égales / par articles / acompte), Espèces avec rendu de monnaie, Carte, Orange Money, Telecel Cash, ticket thermique 80 mm.
> **Module 3** : Tableau de bord gérant — KPI et graphiques en temps réel, gestion de la carte (ruptures diffusées en direct, images), personnel et codes PIN.
> **Module 4** : Sécurité & responsive — session en cookie HttpOnly, verrouillage après inactivité, helmet / CORS / anti-CSRF / limitation de débit, validation Zod stricte, remises plafonnées, journal d'audit anti-fraude en ajout seul, recadrage d'images, interface mobile-first (barre d'onglets, tiroirs, cibles de 48 px).

## Stack

| Couche | Choix |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, Zustand, Lucide, Framer Motion, Recharts |
| Backend | Node.js, Express 5, Socket.io, Zod (validation stricte), JWT en cookie HttpOnly, Helmet, express-rate-limit, Multer (images) |
| Base de données | PostgreSQL + Prisma |

## Arborescence

```
server/
  prisma/schema.prisma      # modèle de données (User, Table, Category, MenuItem, Order, OrderItem, Payment)
  prisma/seed.ts            # données de démo (carte, 12 tables, 5 utilisateurs)
  src/index.ts              # serveur HTTP Express + montage Socket.io
  src/realtime.ts           # salles, authentification socket, événements new_order / order_status
  src/services/orders.ts    # création de bon (prix recalculés côté serveur), cycle de vie KDS
  src/services/checkout.ts  # additions, soldes, versements, clôture de table, données du ticket
  src/services/stats.ts     # KPI du jour, heures de pointe, plats stars (SQL agrégé, fuseau du restaurant)
  src/services/adminMenu.ts # CRUD plats / catégories, ruptures, images
  src/services/adminUsers.ts# personnel, rôles, codes PIN
  src/lib/uploads.ts        # stockage des images (uploads/dishes/), contrôle du format
  prisma/seed-demo.ts       # 30 jours d'historique de ventes pour le tableau de bord
  src/routes/*.ts           # API REST : auth, menu, tables, orders
client/
  src/pages/Login.tsx       # connexion par profil + code PIN
  src/pages/ServerView.tsx  # Vue Serveur : tables → carte → personnalisation → panier → envoi
  src/pages/KitchenView.tsx # Vue Cuisine & Bar : kanban temps réel
  src/pages/CashierView.tsx # Vue Caisse : plan de salle, addition, encaissement
  src/components/cashier/   # FloorPlan, BillItems, PaymentPanel (split + clavier), Receipt (ticket 80 mm)
  src/pages/AdminView.tsx   # Tableau de bord gérant (onglets Stats / Menu / Personnel)
  src/components/admin/     # StatsTab (Recharts), MenuTab + MenuItemForm, StaffTab
  src/store/cart.ts         # panier (Zustand)
  src/lib/socket.ts         # client Socket.io typé
```

## Démarrage

Prérequis : Node.js ≥ 20 et PostgreSQL 14+ (ou Docker).

```bash
docker compose up -d                 # PostgreSQL local (resto / resto / restoapp)
cp server/.env.example server/.env   # adapter DATABASE_URL et JWT_SECRET si besoin
npm install
npm run db:setup                     # migrations + données de démo
npm run db:seed:demo -w server       # (facultatif) 30 jours d'historique pour les statistiques
npm run dev                          # API sur :4000, front sur :5173
```

Ouvrez http://localhost:5173 (ou `http://<ip-du-poste>:5173` depuis une tablette du même réseau).

| Profil | PIN | Écran |
| --- | --- | --- |
| Awa / Issa (serveurs) | 1111 / 2222 | Vue Serveur |
| Cuisine | 3333 | Vue Cuisine & Bar |
| Caisse | 4444 | Vue Caisse |
| Admin | 0000 | Tableau de bord + accès à tout (onglets Salle / Cuisine / Caisse / Gérant) |

Astuce démo : ouvrez la Vue Cuisine dans une fenêtre et la Vue Serveur dans une autre (navigation privée) ; la commande apparaît instantanément côté cuisine.

## Temps réel (Socket.io)

Chaque appareil s'authentifie au handshake avec son cookie de session HttpOnly (origine vérifiée, compte actif, version de session) puis rejoint la salle de son rôle (`kitchen`, `floor`, `cashier`, `admin`). Les charges utiles des événements sont validées par Zod.

| Sens | Événement | Contenu |
| --- | --- | --- |
| client → serveur | `new_order` | `{ type, tableId?, items: [{ menuItemId, quantity, cooking?, side?, extras[], notes? }] }` + accusé `{ ok, data \| error }` |
| client → serveur | `order_status` | `{ orderId, status: PREPARING \| READY \| SERVED \| CANCELLED }` + accusé |
| serveur → clients | `new_order` | bon complet (table, serveur, lignes) |
| serveur → clients | `order_updated` | bon mis à jour |
| serveur → clients | `table_updated` | `{ id, number, status }` |
| serveur → clients | `menu_updated` | `{ action, item? }` — rupture, plat ajouté / modifié / supprimé : les tablettes rechargent la carte |
| serveur → clients | `payment_recorded` | `{ paymentId, tableId, orderIds, amount, remaining, closed }` |

Règles métier côté serveur :
- Les **prix sont recalculés à partir de la carte** (prix de base + suppléments) ; le client n'envoie que des identifiants et des choix, validés contre les options du plat.
- Un plat en rupture (`isAvailable = false`) est refusé.
- Transitions autorisées : `PENDING → PREPARING → READY → SERVED` (+ retour `READY → PREPARING`, annulation avant service). Mise à jour conditionnelle pour éviter les doubles clics concurrents entre écrans.
- Ajouter des articles à une table déjà servie crée un **nouveau bon** pour la même table (ce que la cuisine doit préparer) ; l'addition en caisse regroupera tous les bons non soldés.
- La table passe en `OCCUPIED` au premier bon et redevient `FREE` quand plus aucun bon n'y est ouvert.

## API REST

| Méthode | Route | Rôles |
| --- | --- | --- |
| GET | `/api/auth/users` | public (tuiles de connexion) |
| POST | `/api/auth/login` | public — `{ userId, pin }` → `{ user }` + cookie de session HttpOnly ; 5 essais / 5 min par profil |
| GET | `/api/auth/me` | session en cours (`{ user: null }` si aucune) |
| POST | `/api/auth/logout` | efface le cookie de session |
| GET | `/api/menu` | connecté |
| GET | `/api/tables` | connecté |
| GET | `/api/tables/:id/orders` | connecté — bons ouverts de la table |
| GET | `/api/orders/active` | connecté — bons PENDING / PREPARING / READY |
| POST | `/api/orders` | SERVEUR, CAISSE — équivalent REST de `new_order` |
| PATCH | `/api/orders/:id/status` | CUISINE (SERVEUR : `SERVED` uniquement) |
| GET | `/api/checkout/overview` | CAISSE — solde de chaque table + bons à emporter non réglés |
| GET | `/api/checkout/table/:tableId` | CAISSE — bons ouverts, articles (quantités réglées), versements, totaux |
| GET | `/api/checkout/order/:orderId` | CAISSE — addition d'un bon à emporter / livraison |
| POST | `/api/checkout/pay` | CAISSE — enregistre un versement (voir ci-dessous) |
| POST | `/api/checkout/discount` | CAISSE — remise `{ tableId\|orderId, kind: PERCENT\|AMOUNT, value, reason }` (plafonnée, auditée) |
| GET | `/api/checkout/receipt/:paymentId` | CAISSE — données structurées du ticket |
| GET | `/api/admin/stats/daily?date=AAAA-MM-JJ` | ADMIN — CA (+ variation), commandes, panier moyen, encours, modes de paiement, activité par heure |
| GET | `/api/admin/stats/top-items?period=day\|week\|month` | ADMIN — classement par volume et par valeur |
| GET | `/api/admin/menu` | ADMIN — carte complète (plats masqués inclus) |
| POST / PUT | `/api/admin/menu`, `/api/admin/menu/:id` | ADMIN — multipart : champs + `image` (fichier) ou `imageUrl` |
| PATCH | `/api/admin/menu/:id/toggle-availability` | ADMIN — rupture de stock (bascule, ou `{ isAvailable }`) → `menu_updated` |
| DELETE | `/api/admin/menu/:id` | ADMIN — refusé si le plat a déjà été commandé (le masquer) |
| POST / PUT / DELETE | `/api/admin/categories[/:id]` | ADMIN — catégories (nom, écran Cuisine / Bar) |
| GET / POST | `/api/admin/users` | ADMIN — personnel ; la création renvoie le PIN une seule fois |
| PUT | `/api/admin/users/:id` | ADMIN — nom, rôle, activation |
| PUT | `/api/admin/users/:id/pin` | ADMIN — réinitialise le PIN (saisi ou généré), renvoyé une seule fois |
| GET | `/api/admin/audit-logs?action=&userId=&from=&to=&cursor=` | ADMIN — journal d'audit (lecture seule, paginé) |

## Modèle de données

Montants en entiers (FCFA). En plus des entités demandées :
- `Category.station` (`KITCHEN` / `BAR`) route chaque ligne vers le bon écran ; le KDS filtre Tout / Cuisine / Bar.
- `MenuItem.options` (JSON) : cuissons, accompagnements et suppléments payants proposés.
- `OrderItem` fige `name`, `unitPrice` et les `modifiers` choisis au moment de la commande.
- `Order.type` (sur place / à emporter / livraison) et horodatages `startedAt`, `readyAt`, `servedAt`, `paidAt` pour les statistiques (temps de préparation, heures de pointe).
- `Payment` : un versement porte sur une addition (table ou bon à emporter) et est relié aux bons qu'il couvre (relation n-n). Champs : `amount`, `mode`, `amountReceived`, `changeReturned`, `reference` (Mobile Money / CB), `label` (« Part 2/4 », « Articles », « Acompte »), `cashierId`, `number` (n° de ticket).
- `PaymentItem` + `OrderItem.paidQuantity` : détail des articles réglés lors d'un paiement par sélection.

## Caisse (Module 2)

**Addition** : sur place = tous les bons non soldés de la table ; à emporter = le bon seul.
Solde = total des bons − versements liés à ces bons.

**`POST /api/checkout/pay`**

```jsonc
{
  "tableId": "…",              // ou "orderId" pour un bon à emporter
  "mode": "CASH",              // CASH | CARD | ORANGE_MONEY | TELECEL_CASH
  "amount": 10200,             // solde, part égale ou acompte…
  "items": [{ "orderItemId": "…", "quantity": 1 }], // …ou sélection d'articles (montant calculé côté serveur)
  "amountReceived": 15000,     // espèces remises → rendu calculé côté serveur
  "reference": "PP2610.0001",  // facultatif (Mobile Money / CB)
  "label": "Part 1/2"
}
```

Règles :
- Le montant ne peut pas dépasser le solde ; en espèces, le montant reçu doit le couvrir.
- La table (ou le bon) est verrouillée pendant l'encaissement (`SELECT … FOR UPDATE`) : deux caisses ne peuvent pas solder deux fois la même addition.
- **Solde à 0** : tous les bons reçoivent `paidAt` ; ceux prêts ou servis passent en `PAID` ; la table passe en `FREE` et `table_updated` est diffusé. Si un bon est encore en cuisine, il reste au KDS et la table est libérée quand il est marqué servi (il passe alors directement en `PAID`).
- Un bon ayant reçu un versement ne peut plus être annulé.

**Parts égales** : quote-part = `ceil(reste / parts restantes)`, la dernière part tombe pile sur le solde. Le nombre de parts est retrouvé depuis les libellés « Part k/N » des versements, donc partagé entre caisses et conservé après rechargement.

**Ticket** : composant `Receipt` au format 80 mm (zone utile 72 mm, police monospace). Le bouton « Imprimer / PDF » ouvre la boîte d'impression : choisir l'imprimante thermique (pilote EPSON TM / POS-80, papier 80 mm) ou « Enregistrer en PDF ». Option « Impression auto » dans l'en-tête de la caisse. L'en-tête du ticket (nom, adresse, téléphone, NIF, RCCM, message de pied) se règle dans `server/.env` (`RESTAURANT_*`).

## Tableau de bord gérant (Module 3)

**Statistiques** — calculées en SQL sur `Payment` et `Order`, journées et heures en heure locale du restaurant (`APP_TIMEZONE`, défaut `Africa/Ouagadougou`).
- *Chiffre d'affaires* = montants encaissés. Pour la journée en cours, la variation est calculée face à **hier à la même heure** (comparer une journée entamée à une journée complète afficherait −100 % à l'ouverture).
- *Panier moyen* = montant moyen d'une addition soldée (les bons d'une table soldés ensemble comptent pour une addition).
- *Encours* = additions ouvertes non encaissées.
- Le tableau de bord se rafraîchit seul à chaque encaissement ou nouveau bon (Socket.io).
- Graphiques : CA par heure et bons par heure sont deux histogrammes distincts (pas de double axe). Les 4 modes de paiement utilisent une palette catégorielle vérifiée pour le daltonisme, avec libellés et montants affichés à côté de chaque couleur.

**Carte** — interrupteur de rupture par plat (diffusé instantanément : le plat passe « Épuisé » sur les tablettes, avec une alerte si un serveur l'a dans son panier) ; masquage (le plat disparaît de la carte mais reste dans l'historique) ; suppression définitive uniquement pour un plat jamais commandé. Images : fichier JPEG/PNG/WebP de 3 Mo max, vérifié par sa signature binaire (pas le nom ni le type annoncé ; SVG refusé), enregistré sous un nom aléatoire dans `server/uploads/dishes/` et servi sous `/uploads/…` ; ou URL http(s) d'un CDN (Cloudinary…). L'ancienne image est supprimée du disque lorsqu'elle est remplacée.

**Personnel & sécurité**
- Les codes PIN sont **hachés (bcrypt)** : ni la base ni l'API ne peuvent les relire. Ils s'affichent une seule fois, à la création ou à la réinitialisation, pour être transmis à l'employé.
- Réinitialiser le PIN, changer le rôle ou désactiver un employé **ferme immédiatement ses sessions** (jeton invalidé via `User.sessionVersion`, connexions temps réel coupées).
- Anti force brute : 5 codes erronés sur un profil le verrouillent 5 minutes (levé par une réinitialisation du PIN).
- Un gérant ne peut pas retirer son propre accès, et il reste toujours au moins un gérant actif.

## Sécurité & anti-fraude (Module 4)

**Session**
- Codes PIN hachés (bcrypt), jamais stockés ni journalisés en clair.
- Jeton JWT (HS256) dans un cookie `HttpOnly`, `SameSite=Strict`, `Secure` : illisible par le JavaScript (protégé d'un XSS), jamais envoyé depuis un autre site. Aucun jeton en `localStorage`.
- Durée : 14 h maximum ; expiration côté serveur après `SESSION_IDLE_MINUTES` (30) sans requête, jeton glissant ré-émis au plus une fois par minute. Les écrans cuisine (affichage permanent) n'ont que la limite de 14 h.
- Verrouillage de l'écran après inactivité (gérant / caisse : 5 min, serveur : 10 min, cuisine : jamais), avec avertissement 30 s avant. Le verrouillage ferme la session serveur ; reprise avec le PIN, ou changement d'utilisateur. Bouton cadenas pour verrouiller manuellement.
- Révocation immédiate (réinitialisation de PIN, changement de rôle, désactivation) via `User.sessionVersion` + coupure des sockets.

**Protection de l'API**
- `helmet()` (CSP `default-src 'none'`, `nosniff`, `frame-ancestors 'none'`, HSTS…), `x-powered-by` retiré.
- CORS limité à `CORS_ORIGIN` ; le serveur refuse de démarrer si la liste contient `*`.
- Anti-CSRF en profondeur : toute requête modifiante d'un navigateur doit venir d'une origine autorisée (en plus de `SameSite=Strict`). Même contrôle au handshake Socket.io (anti « cross-site WebSocket hijacking »).
- Validation Zod `.strict()` (champ inconnu = refus) des corps, paramètres d'URL (`router.param`), requêtes et événements Socket.io.
- `express-rate-limit` : PIN 5 essais / 5 min par profil (verrouillage tracé dans l'audit, levé par une réinitialisation du PIN) et 30 échecs / 5 min par appareil ; 600 requêtes / min par IP sur l'API.

**Téléversement**
- Type MIME filtré dès la réception (`image/jpeg`, `image/png`, `image/webp`), puis signature binaire vérifiée et comparée au type annoncé (SVG et fichiers déguisés refusés), 3 Mo maximum.
- Nom de fichier aléatoire (UUID) : le nom d'origine n'est jamais utilisé (aucune traversée de répertoire possible). Servi avec `nosniff`.
- Côté gérant, la photo est recadrée en 4:3 et réencodée (WebP 800×600) dans le navigateur, ce qui supprime aussi les métadonnées EXIF (GPS…).

**Remises** — motif obligatoire ; un caissier ne peut pas dépasser `MAX_CASHIER_DISCOUNT_PCT` (15 %) cumulés sur une addition, au-delà seul un gérant peut l'accorder ; une remise ne peut dépasser le solde. Une remise n'est pas un encaissement : le chiffre d'affaires reste la somme des paiements ; le total des remises du jour apparaît dans le tableau de bord. Un bon ayant reçu un versement ou une remise ne peut plus être annulé.

**Journal d'audit (`AuditLog`)** — `userId`, `action`, `details` (JSON), `timestamp`, `ipAddress`. Écrit **dans la même transaction** que l'action (pas d'action sans trace) pour : annulation de commande, remise, changement de prix, création / suppression de plat, création d'employé, changement de rôle, (dés)activation, réinitialisation de PIN, profil verrouillé par force brute. Le journal est **en ajout seul** : un trigger PostgreSQL refuse tout `UPDATE` / `DELETE`, même pour un gérant ; aucune route de modification n'existe. Consultation filtrable dans l'onglet « Journal d'audit ».

**Vérification** — `npm run test:security -w server` (API démarrée, base de démo fraîche) rejoue 37 contrôles de bout en bout sur ces protocoles.

**Déploiement** — le cookie `Secure` exige HTTPS : en production, servir l'application derrière un proxy TLS (Caddy, Nginx…). `localhost` est accepté en développement ; pour tester depuis une tablette en `http://IP-locale`, mettre `COOKIE_SECURE=false` (avertissement au démarrage) et ajouter l'origine à `CORS_ORIGIN`. Remplacer `JWT_SECRET` par une valeur aléatoire (refusé en production si trop courte).

## Interface responsive

| Écran | Disposition du tableau de bord |
| --- | --- |
| Smartphone (< 640 px) | barre d'onglets inférieure (Stats, Menu, Équipe, Audit, Écrans), une colonne, cartes tactiles au lieu des tableaux, formulaires en tiroir glissable (fermeture par glissement vers le bas) |
| Tablette / caisse tactile (640–1024 px) | barre latérale rétractable (icônes ↔ libellés), grilles de 2 colonnes, cibles tactiles ≥ 48 px |
| Grand écran (> 1024 px) | barre latérale dépliée, contenu centré `max-w-7xl`, KPI sur 4 colonnes à partir de 1280 px |
