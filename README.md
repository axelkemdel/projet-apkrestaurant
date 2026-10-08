# RestoApp — POS & KDS temps réel pour restaurants

Application de gestion des commandes : prise de commande par les serveurs (tablette / mobile), écran cuisine & bar (KDS) en temps réel, caisse et tableau de bord gérant.

> **Étape 1 livrée** : schéma de BDD complet, API Express + Socket.io (`new_order`), Vue Serveur et Vue Cuisine.
> Prochaines étapes : Vue Caisse (addition partagée, Espèces / CB / Orange Money / Telecel Cash, ticket) et Dashboard gérant.

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
  src/routes/*.ts           # API REST : auth, menu, tables, orders
client/
  src/pages/Login.tsx       # connexion par profil + code PIN
  src/pages/ServerView.tsx  # Vue Serveur : tables → carte → personnalisation → panier → envoi
  src/pages/KitchenView.tsx # Vue Cuisine & Bar : kanban temps réel
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
| Caisse | 4444 | (Vue Caisse à venir) |
| Admin | 0000 | accès à tout |

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

## Modèle de données

Montants en entiers (FCFA). En plus des entités demandées :
- `Category.station` (`KITCHEN` / `BAR`) route chaque ligne vers le bon écran ; le KDS filtre Tout / Cuisine / Bar.
- `MenuItem.options` (JSON) : cuissons, accompagnements et suppléments payants proposés.
- `OrderItem` fige `name`, `unitPrice` et les `modifiers` choisis au moment de la commande.
- `Order.type` (sur place / à emporter / livraison) et horodatages `startedAt`, `readyAt`, `servedAt`, `paidAt` pour les statistiques (temps de préparation, heures de pointe).
- `Payment` : plusieurs paiements par bon pour l'addition partagée (prévu pour l'étape Caisse), avec `reference` pour les transactions Mobile Money.
