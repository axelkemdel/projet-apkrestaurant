# RestoApp — POS & KDS temps réel pour restaurants

Application de gestion des commandes : prise de commande par les serveurs (tablette / mobile), écran cuisine & bar (KDS) en temps réel, caisse et tableau de bord gérant.

> **Étape 1** : schéma de BDD, API Express + Socket.io (`new_order`), Vue Serveur et Vue Cuisine.
> **Module 2** : Caisse — additions par table, addition partagée (parts égales / par articles / acompte), Espèces avec rendu de monnaie, Carte, Orange Money, Telecel Cash, ticket thermique 80 mm.
> Prochaine étape : Dashboard gérant (CRUD carte, statistiques, utilisateurs).

## Stack

| Couche | Choix |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, Zustand, Lucide, Framer Motion |
| Backend | Node.js, Express 5, Socket.io, Zod (validation), JWT (session par PIN) |
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
  src/routes/*.ts           # API REST : auth, menu, tables, orders
client/
  src/pages/Login.tsx       # connexion par profil + code PIN
  src/pages/ServerView.tsx  # Vue Serveur : tables → carte → personnalisation → panier → envoi
  src/pages/KitchenView.tsx # Vue Cuisine & Bar : kanban temps réel
  src/pages/CashierView.tsx # Vue Caisse : plan de salle, addition, encaissement
  src/components/cashier/   # FloorPlan, BillItems, PaymentPanel (split + clavier), Receipt (ticket 80 mm)
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
npm run dev                          # API sur :4000, front sur :5173
```

Ouvrez http://localhost:5173 (ou `http://<ip-du-poste>:5173` depuis une tablette du même réseau).

| Profil | PIN | Écran |
| --- | --- | --- |
| Awa / Issa (serveurs) | 1111 / 2222 | Vue Serveur |
| Cuisine | 3333 | Vue Cuisine & Bar |
| Caisse | 4444 | Vue Caisse |
| Admin | 0000 | accès à tout (onglets Salle / Cuisine / Caisse) |

Astuce démo : ouvrez la Vue Cuisine dans une fenêtre et la Vue Serveur dans une autre (navigation privée) ; la commande apparaît instantanément côté cuisine.

## Temps réel (Socket.io)

Chaque appareil se connecte avec son jeton JWT (`auth: { token }`) et rejoint la salle de son rôle (`kitchen`, `floor`, `cashier`, `admin`).

| Sens | Événement | Contenu |
| --- | --- | --- |
| client → serveur | `new_order` | `{ type, tableId?, items: [{ menuItemId, quantity, cooking?, side?, extras[], notes? }] }` + accusé `{ ok, data \| error }` |
| client → serveur | `order_status` | `{ orderId, status: PREPARING \| READY \| SERVED \| CANCELLED }` + accusé |
| serveur → clients | `new_order` | bon complet (table, serveur, lignes) |
| serveur → clients | `order_updated` | bon mis à jour |
| serveur → clients | `table_updated` | `{ id, number, status }` |
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
| POST | `/api/auth/login` | public — `{ userId, pin }` → `{ token, user }` |
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
| GET | `/api/checkout/receipt/:paymentId` | CAISSE — données structurées du ticket |

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
