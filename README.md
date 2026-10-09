# THAONI APP — POS & KDS temps réel pour restaurants

Application de gestion des commandes : prise de commande par les serveurs (tablette / mobile), écran cuisine & bar (KDS) en temps réel, caisse et tableau de bord gérant.

> **Étape 1** : schéma de BDD, API Express + Socket.io (`new_order`), Vue Serveur et Vue Cuisine.
> **Module 2** : Caisse — additions par table, addition partagée (parts égales / par articles / acompte), Espèces avec rendu de monnaie, Carte, Orange Money, Telecel Cash, ticket thermique 80 mm.
> **Module 3** : Tableau de bord gérant — KPI et graphiques en temps réel, gestion de la carte (ruptures diffusées en direct, images), personnel et codes PIN.
> **Module 5** : Multilingue FR / EN — interface intégralement traduite (sélecteur sur tous les écrans), carte et bons bilingues, bascule de traduction des bons en cuisine et en caisse, tickets dans la langue du client, erreurs serveur traduites.
> **Module 6** : Portail client par QR code — chaque table a un QR code secret : carte bilingue avec photos, commande envoyée directement en cuisine, suivi des plats en direct, appel du serveur, demande d'addition, avis 1 à 5 étoiles ; génération / impression des QR codes dans le tableau de bord.
> **Module 7** : Connexion « Zero-Trust » (identifiant + PIN, pavé mélangé, jetons d'accès 15 min + rafraîchissement rotatif, réponses uniformes à durée constante, routes par rôle) et application Android (Capacitor) pour les tablettes.
> **Module 4** : Sécurité & responsive — session en cookie HttpOnly, verrouillage après inactivité, helmet / CORS / anti-CSRF / limitation de débit, validation Zod stricte, remises plafonnées, journal d'audit anti-fraude en ajout seul, recadrage d'images, interface mobile-first (barre d'onglets, tiroirs, cibles de 48 px).

## Stack

| Couche | Choix |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, Zustand, Lucide, Framer Motion, Recharts, i18next / react-i18next |
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
  src/services/publicPortal.ts # portail client (QR) : table par jeton, commande, appels, avis
  src/services/adminTables.ts  # plan de salle, régénération des QR codes, avis clients
  src/routes/public.ts      # API publique /api/public (sans compte, débit limité)
  src/routes/*.ts           # API REST : auth, menu, tables, orders
client/
  src/pages/Login.tsx       # connexion par profil + code PIN
  src/pages/ServerView.tsx  # Vue Serveur : tables → carte → personnalisation → panier → envoi
  src/pages/KitchenView.tsx # Vue Cuisine & Bar : kanban temps réel
  src/pages/CashierView.tsx # Vue Caisse : plan de salle, addition, encaissement
  src/components/cashier/   # FloorPlan, BillItems, PaymentPanel (split + clavier), Receipt (ticket 80 mm)
  src/pages/AdminView.tsx   # Tableau de bord gérant (onglets Stats / Menu / Personnel)
  src/components/admin/     # StatsTab (Recharts), MenuTab + MenuItemForm, StaffTab
  src/pages/CustomerTableDashboard.tsx # portail client /qr/:token (carte, panier, suivi, appels, avis)
  src/components/customer/  # GuestMenu, GuestCartSheet, OrderTracker, ReviewModal
  src/components/admin/TablesTab.tsx # plan de salle & QR codes (impression A4 / PDF, PNG)
  src/lib/qr.ts             # génération des QR codes (SVG, PNG, planche imprimable)
  src/store/cart.ts         # panier (Zustand) ; store/guestCart.ts : panier client
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

Comptes de démonstration (identifiant + PIN, à changer avant toute mise en service) :

| Identifiant | PIN | Écran après connexion |
| --- | --- | --- |
| `awa` / `issa` (serveurs) | 1111 / 2222 | `/pos/tables` — prise de commande |
| `cuisine` | 3333 | `/kds/kitchen` — écran Cuisine & Bar |
| `caisse` | 4444 | `/cashier/checkout` — caisse |
| `admin` | 0000 | `/admin/dashboard` — tableau de bord + accès à tout |

Astuce démo : ouvrez la Vue Cuisine dans une fenêtre et la Vue Serveur dans une autre (navigation privée) ; la commande apparaît instantanément côté cuisine.

## Temps réel (Socket.io)

Chaque appareil s'authentifie au handshake avec son cookie de session HttpOnly (origine vérifiée, compte actif, version de session) puis rejoint la salle de son rôle (`kitchen`, `floor`, `cashier`, `admin`). Les charges utiles des événements sont validées par Zod.

| Sens | Événement | Contenu |
| --- | --- | --- |
| client → serveur | `new_order` | `{ type, language: FR\|EN, tableId?, items: [{ menuItemId, quantity, cooking?, side?, extras[], quickNotes[], notes? }] }` + accusé `{ ok, data \| error }` |
| client → serveur | `set_lang` | `"fr" \| "en"` — langue des erreurs renvoyées dans les accusés |
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
| GET | `/api/menu` | connecté — carte bilingue (`nameFr`/`nameEn`, options `{ fr, en }`) |
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
- Anti force brute : 5 codes erronés en 5 min ou 20 en 24 h bloquent l'identifiant (levé par une réinitialisation du PIN). Les PIN générés ont 6 chiffres.
- Réinitialiser **son propre** PIN garde la session de l'appareil utilisé mais ferme toutes les autres.
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

**Déploiement** — le cookie `Secure` exige HTTPS : en production, servir l'application derrière un proxy TLS (Caddy, Nginx…). `localhost` est accepté en développement ; pour tester depuis une tablette en `http://IP-locale`, mettre `COOKIE_SECURE=false` (avertissement au démarrage) et ajouter l'origine à `CORS_ORIGIN`. Remplacer `JWT_SECRET` par une valeur aléatoire d'au moins 32 caractères : une valeur faible est refusée en production et remplacée ailleurs par un secret temporaire (sessions perdues au redémarrage).

## Interface responsive

| Écran | Disposition du tableau de bord |
| --- | --- |
| Smartphone (< 640 px) | barre d'onglets inférieure (Stats, Menu, Équipe, Audit, Écrans), une colonne, cartes tactiles au lieu des tableaux, formulaires en tiroir glissable (fermeture par glissement vers le bas) |
| Tablette / caisse tactile (640–1024 px) | barre latérale rétractable (icônes ↔ libellés), grilles de 2 colonnes, cibles tactiles ≥ 48 px |
| Grand écran (> 1024 px) | barre latérale dépliée, contenu centré `max-w-7xl`, KPI sur 4 colonnes à partir de 1280 px |

## Multilingue FR / EN (Module 5)

**Interface** — `i18next` + `react-i18next`, dictionnaires `client/src/i18n/fr.ts` et `en.ts` (≈ 410 clés). Les clés sont **typées** : une clé inconnue ou absente de l'anglais est une erreur de compilation. Sélecteur FR / EN sur chaque écran (connexion, verrouillage, serveur, cuisine, caisse, gérant), mémorisé par appareil ; langue par défaut du restaurant : `VITE_DEFAULT_LANG` (français par défaut — la langue du navigateur n'est volontairement pas utilisée, beaucoup de tablettes étant réglées en anglais). Montants, dates, heures et pourcentages sont formatés selon la langue (« 12 500 F » / « 12,500 F », « 15 % » / « 15% »).

**Carte bilingue** — `MenuItem.nameFr / nameEn / descriptionFr / descriptionEn`, `Category.nameFr / nameEn`, et options en paires `{ fr, en }` (cuissons, accompagnements, suppléments). Le français est la valeur de référence transmise par les tablettes. Le gérant saisit les deux langues côte à côte ; la recherche fonctionne dans les deux langues.

**Bons de commande et bascule de traduction**
- Chaque bon enregistre la langue de prise de commande (`Order.language`) et une copie figée bilingue des noms (`OrderItem.nameFr / nameEn`) et des options.
- Les notes rapides sont des **codes** (`NO_ONION`, `EXTRA_SPICY`, `PEANUT_ALLERGY`…) traduits à l'affichage : « No onions » devient « Sans oignon » en cuisine.
- Le **texte libre** saisi par le serveur n'est pas traduit automatiquement (aucun service de traduction externe) : il est affiché tel quel, signalé « texte libre, non traduit ».
- **Cuisine (KDS)** : réglage de l'écran « Bons en FR / EN » (langue de l'écran) ou « Langue d'origine », badge EN sur les bons pris en anglais, et bouton « Voir en français / Voir en anglais » sur chaque bon.
- **Caisse** : bascule FR / EN des articles de l'addition ; le **ticket** est édité par défaut dans la langue du client (langue de prise de commande), avec un choix FR / EN avant impression. Les motifs de remise proposés et les libellés de versement (« Part 2/4 », « Acompte ») sont traduits.

**API** — les erreurs sont des **codes stables** traduits selon l'en-tête `Accept-Language` envoyé par l'écran : `{ "code": "order.itemUnavailable", "error": "“Grilled chicken” is no longer available" }` (le nom du plat suit aussi la langue). Les messages de validation Zod personnalisés, les limites de débit et les erreurs Socket.io (langue déclarée au handshake, puis `set_lang`) le sont également.

**Migration** — `20261008180000_bilingual_menu` renomme les colonnes existantes (pas de `DROP`) et initialise l'anglais avec le français : compléter ensuite les libellés anglais dans « Gestion du menu ». Les options déjà stockées en format monolingue sont lues automatiquement comme `{ fr, en }`.

**Vérification** — `npm run test:i18n -w server` (API démarrée, base de démo fraîche).

## Portail client par QR code (Module 6)

**Parcours client** — Le client scanne le QR code de sa table et arrive sur `/qr/<jeton>` (aucun compte, aucun mot de passe). Si la table est déjà occupée, il **rejoint la session en cours** : tous les bons non soldés de la table s'affichent, y compris ceux pris par le serveur, et plusieurs téléphones de la même table voient la même chose en direct.
- **Carte** bilingue (sélecteur FR / EN), grandes photos, puces de catégories qui suivent le défilement, recherche dans les deux langues, plats épuisés grisés.
- **Personnalisation** : cuissons, accompagnements, suppléments payants, notes rapides (« Sans oignon »…) et texte libre.
- **Panier** en tiroir : quantités, note pour la cuisine, total en FCFA ; conservé si la page est rechargée. L'envoi crée le bon et le diffuse **directement en cuisine / au bar** (`new_order`) ; la table passe `OCCUPIED`.
- **Suivi en direct** de chaque bon : ⏳ Reçue → 👨‍🍳 En préparation → 🔔 Prête → ✅ Servie (barre de progression animée, vibration quand c'est prêt), sans rechargement de page.
- **Appeler le serveur** et **Demander l'addition** : alerte instantanée (son, vibration, bandeau « Demandes des clients » et badge sur la table) sur les tablettes des serveurs ; la caisse reçoit les demandes d'addition. Le serveur clique « Pris en compte » et l'alerte disparaît partout, y compris chez le client.
- **Avis** : une fois les plats servis, l'addition demandée ou la table réglée, une fenêtre propose une note de 1 à 5 étoiles et un commentaire facultatif. Le gérant voit la moyenne, la répartition et les derniers commentaires dans « Aperçu / Stats ».
- Quand l'addition est réglée, la table est libérée et le client voit « Merci de votre visite ! » ; les clients suivants repartent d'une session vierge.

**QR codes (gérant → onglet « Plan de salle & QR »)** — création / modification / suppression des tables, aperçu du QR code de chaque table, **impression** d'une planche A4 de 6 supports bilingues à découper (« Enregistrer au format PDF » dans la boîte d'impression pour obtenir un PDF), **image PNG** haute définition, copie du lien. **Nouveau QR code** : invalide immédiatement l'ancien (QR code photographié ou emporté) et déconnecte les clients qui l'utilisaient ; l'action est tracée au journal d'audit.

L'adresse encodée est celle depuis laquelle l'administration est ouverte, ou `VITE_PUBLIC_URL` (`client/.env`) si elle est définie. Un avertissement s'affiche si cette adresse est `localhost` : les téléphones des clients ne pourraient pas l'ouvrir. Dans GitHub Codespaces, passez le port 5173 en visibilité **Public** (onglet Ports) pour que les téléphones puissent ouvrir la page.

**Sécurité**
- Le QR code contient un **jeton secret** (UUID v4 aléatoire) et non le numéro de table : `/table/5` serait devinable et permettrait de commander pour une table depuis l'extérieur. Le jeton n'est jamais renvoyé aux écrans du personnel (seul le gérant le voit).
- API publique `/api/public/*` : schémas Zod stricts (aucun prix accepté du client, table déduite du jeton, 30 lignes et 20 unités par ligne au plus), prix et disponibilités revérifiés côté serveur, **débit limité par appareil et par table** (8 commandes / 10 min, 12 appels / 10 min, 5 avis / h) ; un même appel répété dans la minute n'est pas renotifié.
- Temps réel : espace Socket.io séparé `/public`, authentifié par le jeton ; un client ne reçoit que les événements de **sa** table (vue épurée des bons : ni serveur, ni paiements) et ne peut rien émettre. L'espace du personnel reste fermé sans session.
- Un avis porte forcément sur un bon réel et récent de la table, un seul avis par bon.
- `PUBLIC_ORDERING=false` (`server/.env`) : les clients consultent la carte, suivent leurs bons et appellent le serveur, mais ne commandent pas eux-mêmes.
- Les bons passés par les clients portent `source = CUSTOMER` et n'ont pas de serveur. Ils sont signalés par une icône QR en cuisine et par « Client (QR) » en caisse.

| Méthode | Route | Accès |
| --- | --- | --- |
| GET | `/api/public/table/:token` | public — table, carte bilingue, bons en cours, bons déjà notés |
| POST | `/api/public/orders` | public — `{ token, language, customerNote?, items[] }` → bon envoyé en cuisine |
| POST | `/api/public/table/:token/call-server` | public — alerte `server_alert` aux serveurs |
| POST | `/api/public/table/:token/request-bill` | public — alerte `request_bill` aux serveurs et à la caisse |
| POST | `/api/public/reviews` | public — `{ token, orderId?, rating: 1–5, comment? }` |
| POST | `/api/tables/:id/requests/clear` | SERVEUR, CAISSE — `{ kind?: CALL\|BILL }` demande prise en compte |
| GET / POST / PUT / DELETE | `/api/admin/tables[/:id]` | ADMIN — plan de salle (jetons QR inclus) |
| POST | `/api/admin/tables/:id/regenerate-qr` | ADMIN — nouveau jeton, ancien invalidé |
| GET | `/api/admin/reviews` | ADMIN — moyenne, répartition, derniers avis |

Événements Socket.io ajoutés : `server_alert`, `request_bill`, `table_alert_cleared` (personnel) ; sur l'espace `/public` : `order_status_changed`, `table_updated`, `menu_updated`.

**Migration** — `20261009100000_customer_portal` : jeton QR généré pour les tables existantes, `Order.source`, `Order.serverId` facultatif, demandes en attente sur `Table`, modèle `Review` (note contrainte entre 1 et 5 en base).

**Vérification** — `npm run test:portal -w server` (API démarrée, base de démo fraîche : `npm run db:seed -w server`).

## Connexion « Zero-Trust » (Module 7)

**Écran de connexion (`/login`, `client/src/pages/LoginPage.tsx`)** — aucune liste de comptes n'est affichée ni renvoyée par l'API (`/api/auth/users` supprimée) : l'employé saisit son **identifiant** puis son **code PIN** (4 à 6 chiffres) sur un pavé tactile. Le pavé est **mélangé** par défaut (tirage cryptographique, nouvelle disposition après chaque échec) contre les regards indiscrets ; le clavier physique est aussi accepté. Sélecteur FR / EN en haut à droite. **Pas d'inscription** : seul le gérant crée les comptes (« Personnel & PIN », `/admin/users` : nom, identifiant, rôle, PIN haché, actif / inactif).

**Redirection par rôle** — `ADMIN → /admin/dashboard`, `SERVEUR → /pos/tables`, `CUISINE → /kds/kitchen`, `CAISSE → /cashier/checkout`. Côté écran, `ProtectedRoute` renvoie vers l'écran du rôle ; côté API, chaque route passe par `authenticateJWT` puis `requireRole` (chaque refus 403 est journalisé). Les anciennes adresses (`/serveur`, `/cuisine`, `/caisse`) redirigent.

**Jetons et sessions** (`server/src/lib/auth.ts`)
- **Jeton d'accès** : JWT HS256 de **15 min** (émetteur / audience vérifiés, type « access », sans rôle ni donnée sensible), cookie `HttpOnly` + `SameSite=Strict` + `Secure`. À chaque requête, la session et le compte sont **relus en base** : déconnexion, désactivation, changement de rôle ou de PIN prennent effet immédiatement.
- **Jeton de rafraîchissement** : 32 octets aléatoires, cookie `HttpOnly` limité au chemin `/api/auth`, stocké **haché (SHA-256)** dans `AuthSession`. **Rotation** à chaque rafraîchissement ; la présentation d'un ancien jeton (cookie volé ou rejoué) **révoque toute la session**. Limite absolue 14 h.
- L'écran renouvelle le jeton d'accès toutes les 12 min s'il est utilisé ; une requête refusée pour jeton expiré est rejouée une fois après rafraîchissement.
- **Déconnexion pour inactivité** (serveur, caisse, gérant ; `client/src/hooks/useAutoLogout.ts`) : après **4 min** sans souris, toucher ni clavier, une fenêtre d'avertissement (`InactivityModal`) affiche un compte à rebours de **60 s** avec « Rester connecté » (le délai repart, la session serveur est prolongée) ou « Se déconnecter maintenant ». À zéro : `POST /api/auth/logout`, état local effacé, retour sur `/login` avec le message « Session expirée pour inactivité ». Les délais sont calculés depuis la dernière interaction : une tablette sortie de veille après le délai est déconnectée aussitôt. Les écrans cuisine (affichage mural permanent) ne sont jamais déconnectés. Pour les essais : `VITE_AUTO_LOGOUT_WARN_MS` et `VITE_AUTO_LOGOUT_COUNTDOWN_S` à la compilation.
- **Déconnexion manuelle** : le bouton de l'en-tête ouvre une confirmation (`LogoutConfirmationModal`, « Annuler » sélectionné par défaut, Échap pour fermer). Le cadenas verrouille l'écran sans déconnecter : le PIN est redemandé sur un pavé mélangé.
- Les connexions **Socket.io** s'authentifient avec le jeton d'accès, sont coupées à la déconnexion ou à la révocation, et sont revérifiées en base toutes les 60 s.

**Anti force brute & anti attaque temporelle**
- Message **unique** « Identifiants invalides » (identifiant inconnu, PIN faux ou mal formé, compte désactivé), sans cookie posé.
- **Durée constante** : toute réponse de connexion, réussie ou non, part au plus tôt après 800 ms (`LOGIN_MIN_RESPONSE_MS`) ; une comparaison bcrypt est toujours faite (empreinte factice si l'identifiant n'existe pas).
- `express-rate-limit` : **5 échecs / 5 min par identifiant** (bloqué sur tous les appareils, même avec le bon PIN) et **10 échecs / 5 min par appareil** (IP), réglables (`LOGIN_MAX_ATTEMPTS_ACCOUNT`, `LOGIN_MAX_ATTEMPTS_IP`). Le seuil par IP est un peu plus large car les tablettes d'un restaurant sortent souvent par la même adresse. Message identique dans les deux cas.
- PIN hachés par **bcrypt (coût 12)** ; les anciens hachages sont mis à niveau automatiquement à la connexion.

**Journal d'audit** — chaque tentative est tracée avec l'IP et l'appareil : `LOGIN_SUCCESS`, `LOGIN_FAILED` (motif : identifiant inconnu / PIN erroné / compte désactivé, jamais renvoyé au client), `LOGIN_LOCKED`, `LOGOUT`, `SESSION_REVOKED` (jeton rejoué), `ACCESS_DENIED` (route d'un autre rôle). Aucun PIN n'est jamais journalisé.

**Middlewares** (`server/src/middleware/`) : `rateLimiter.ts`, `validateZod.ts` (`validateBody`), `authenticateJWT.ts`, `requireRole.ts` (`requireRole`, `requireAuth`), `auditLogger.ts` (`auditLogger`, `auditEvent`).

| Méthode | Route | Accès |
| --- | --- | --- |
| POST | `/api/auth/login` | public — `{ username, pin }` → `{ user }` + cookies ; réponse uniforme à durée constante |
| POST | `/api/auth/refresh` | cookie de rafraîchissement — rotation, nouveau jeton d'accès |
| GET | `/api/auth/me` | session en cours (reprise silencieuse si le jeton d'accès a expiré), sinon `{ user: null }` |
| POST | `/api/auth/logout` | révoque la session, efface les cookies, coupe le temps réel |
| POST | `/api/admin/users` | ADMIN — `{ name, username, role, pin? }` ; PIN renvoyé une seule fois |
| PUT | `/api/admin/users/:id` | ADMIN — nom, identifiant, rôle, actif / inactif (révocation immédiate des sessions) |

**Migration** — `20261010090000_zero_trust_auth` : identifiant dérivé du nom pour les comptes existants (ex. « Awa (serveuse) » → `awaserveuse`, modifiable par le gérant), table `AuthSession`, nouvelles actions d'audit.

**Vérification** — `npm run test:auth -w server` (52 vérifications ; API démarrée, base de démo fraîche).

## Audit de sécurité (octobre 2026)

Audit complet (authentification, RBAC, injections, Socket.io, en-têtes, limites de débit, secrets, erreurs et journal). Aucune faille critique ; correctifs appliqués :

| Gravité | Constat | Correctif |
| --- | --- | --- |
| Élevée | PostgreSQL publié sur toutes les interfaces avec `resto/resto` | `docker-compose.yml` : port lié à `127.0.0.1` uniquement |
| Élevée | PIN 4 chiffres : ~1 400 essais / jour possibles | Second palier 20 échecs / 24 h par identifiant (`LOGIN_MAX_ATTEMPTS_ACCOUNT_DAILY`), PIN générés à 6 chiffres |
| Moyenne | `JWT_SECRET` faible accepté hors `NODE_ENV=production` | Secret faible refusé en production, remplacé ailleurs par un secret aléatoire temporaire |
| Moyenne | Plats (disponibilité, options, catégorie…), catégories et tables modifiés sans trace | Actions `MENU_ITEM_UPDATED`, `MENU_CATEGORY_CHANGED`, `TABLE_CHANGED` (ancien → nouveau) |
| Moyenne | QR code photographié : commandes en rafale en changeant d'IP | 5 bons clients en attente maximum par table |
| Moyenne | Annulation d'un bon pendant son encaissement ; bon ajouté pendant la clôture | Même verrou de ligne (`FOR UPDATE`) que la caisse |
| Moyenne | Réinitialiser son propre PIN laissait ses autres sessions ouvertes | Autres sessions révoquées, appareil courant conservé |
| Moyenne | Seed de démonstration exécutable en production | Refusé si `NODE_ENV=production` |
| Faible | Identifiant de session + secret forgé : révocation / déconnexion de la session d'autrui | Seul un ancien jeton authentique déclenche la révocation ; la déconnexion exige une session prouvée |
| Faible | JSON illisible, corps trop gros, élément supprimé entre-temps → 500 | 400 / 413 / 404 / 409 traduits, sans détail technique |
| Faible | Dates impossibles (31 février), montants hors bornes INT → 500 | Validation calendaire, plafond 1 000 000 000 |
| Faible | Images de plats en `http://` | `https://` uniquement (cohérent avec la CSP) |
| Faible | CSP interface `connect-src ws: wss:` | `connect-src 'self'` |
| Faible | `X-Forwarded-Host` / `X-Forwarded-For` falsifiables | Crus seulement depuis le proxy local ; IP = dernière adresse ajoutée |
| Faible | Socket ouvert prolongeant une session inactive | Inactivité revérifiée toutes les 60 s (sauf cuisine) |
| Faible | Dernier gérant : vérification hors transaction | Vérification dans la transaction, gérants verrouillés |

**Risques acceptés / recommandations** : servir en HTTPS (`COOKIE_SECURE=true`) ; changer le mot de passe PostgreSQL et utiliser un rôle sans droit `TRUNCATE` en production ; changer les PIN de démonstration ; signer l'APK de production (la CI produit un APK *debug*) ; l'origine `http://localhost` reste autorisée (application Android) ; la cuisine peut annuler un bon (prévu, tracé).

**Vérification** — `npm run test:hardening -w server` (24 vérifications).

## Application Android (Capacitor)

Le dossier `client/android/` est un projet Android Studio prêt à compiler (Capacitor 8, application **THAONI APP**, identifiant **`com.restoapp.pos`**, interface web `client/dist`). Plugins : `@capacitor/status-bar` (barre d'état sombre), `@capacitor/keyboard` (l'écran se redimensionne au-dessus du clavier virtuel), `@capacitor/screen-orientation` (**paysage imposé** pour la caisse et la cuisine, orientation libre ailleurs).

**Principe** : l'APK charge l'interface depuis le serveur THAONI APP. Interface et API ont ainsi la même origine, condition pour des cookies `HttpOnly` + `SameSite=Strict`, et une mise à jour de l'interface sur le serveur arrive sur toutes les tablettes sans réinstaller l'APK. En production, le serveur Node sert lui-même l'interface compilée (`npm run build` puis `npm start -w server` : interface + API sur le port 4000).

**Adresse du serveur** (`client/scripts/server-url.cjs`, utilisée par `capacitor.config.ts`, `vite build` et la configuration réseau Android), dans cet ordre :
1. `CAP_SERVER_URL` (ou `VITE_SERVER_URL`) si elle est définie — recommandé en production ;
2. dans GitHub Codespaces : l'adresse publique du Codespace, `https://<codespace>-5173.app.github.dev` (port `CAP_SERVER_PORT`, 5173 par défaut) ;
3. sinon, l'adresse IP locale de la machine : `http://<IP>:5173` (tablettes sur le même réseau).

L'adresse retenue est affichée pendant `cap:sync` (« Serveur de l'application : … »). Elle est aussi injectée dans l'interface embarquée : si l'APK démarre quand même sur cette interface, il redirige vers le serveur. Le serveur accepte les origines de l'application (`capacitor://localhost`, `http(s)://localhost`) et toutes les adresses publiques de son propre Codespace.

**Compiler l'APK depuis le terminal (Codespace ou Ubuntu, sans Android Studio)**

```bash
npm run android:sdk -w client   # une seule fois : JDK 21 + SDK Android en ligne de commande (~1 Go)
npm run apk:debug -w client     # vite build + cap sync android + ./gradlew assembleDebug
# → client/android/app/build/outputs/apk/debug/app-debug.apk
```

Avec une adresse précise : `CAP_SERVER_URL=http://192.168.1.10:4000 npm run apk:debug -w client`. Dans un Codespace, passez le port 5173 en visibilité **Public** (onglet Ports) pour que les tablettes puissent l'ouvrir, et gardez `npm run dev` lancé.

**Avec Android Studio** : `npm run cap:sync -w client` (`vite build && npx cap sync android`) puis `npm run cap:open -w client` et **Build → Build APK(s)**.

**Sur les serveurs de GitHub** : le workflow `.github/workflows/android-apk.yml` compile l'APK à chaque modification de `client/` avec l'adresse de la variable de dépôt `CAP_SERVER_URL` (Settings → Secrets and variables → Actions → Variables) et le publie dans les « Artifacts » de l'exécution (`restoapp-debug-apk`). Le bouton **Run workflow** (adresse saisie à la main) n'apparaît qu'une fois le workflow présent sur la branche par défaut (`main`).

**Réseau et sécurité Android**
- `res/xml/network_security_config.xml` est **régénéré à chaque `cap sync`** (`scripts/android-network-config.mjs`) : HTTPS obligatoire partout, et HTTP en clair autorisé **uniquement vers l'hôte du serveur** si son adresse est en `http://` (serveur du réseau local). Recommandé : HTTPS (certificat sur le serveur ou proxy type Caddy), aucune exception n'est alors générée.
- Serveur en `http://` sur le réseau local : mettre `COOKIE_SECURE=false` dans `server/.env` (Android refuse les cookies `Secure` hors HTTPS) et ajouter l'adresse à `CORS_ORIGIN`.
- Pas de sauvegarde cloud des données de l'application (`allowBackup=false`, règles d'extraction Android 12+) ; débogage WebView désactivé sauf `CAP_DEBUG=true`.
- APK compilé sans `CAP_SERVER_URL` : un écran explique comment recompiler avec l'adresse du serveur.
- Icônes et écrans de démarrage : générés depuis `client/public/assets/logoresto.png` par `python3 client/scripts/generate_android_assets.py` (Pillow) ; à relancer après un changement de logo.
- Pour publier : générer un APK / AAB **signé** (Android Studio → Build → Generate Signed Bundle / APK) avec une clé conservée hors du dépôt.

