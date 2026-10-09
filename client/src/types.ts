// Types partagés avec l'API (miroir du schéma Prisma côté serveur)

export type Role = "ADMIN" | "SERVEUR" | "CUISINE" | "CAISSE";
export type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";
export type OrderStatus = "PENDING" | "PREPARING" | "READY" | "SERVED" | "PAID" | "CANCELLED";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
/** STAFF : saisi par le personnel ; CUSTOMER : commandé par le client via le QR code de sa table */
export type OrderSource = "STAFF" | "CUSTOMER";
export type Station = "KITCHEN" | "BAR";
export type Lang = "fr" | "en";
/** Langue de prise de commande, telle que stockée côté serveur */
export type OrderLanguage = "FR" | "EN";

/** Libellé bilingue d'une option (le français est la valeur de référence envoyée au serveur). */
export interface Label {
  fr: string;
  en: string;
}

export interface User {
  id: string;
  name: string;
  /** Identifiant de connexion (code employé) */
  username: string;
  role: Role;
}

export interface Table {
  id: string;
  number: number;
  capacity: number;
  zone: string;
  status: TableStatus;
  openOrders: number;
  /** Demandes du client en attente (QR code) */
  callRequestedAt: string | null;
  billRequestedAt: string | null;
}

export interface Extra extends Label {
  price: number;
}

export interface MenuOptions {
  cooking?: Label[];
  sides?: Label[];
  extras?: Extra[];
}

/** Codes des notes rapides (traduits côté écran) — miroir de QUICK_NOTES côté serveur. */
export const QUICK_NOTES = [
  "NO_ONION",
  "NO_CHILI",
  "EXTRA_SPICY",
  "SAUCE_ON_SIDE",
  "NO_SALT",
  "PEANUT_ALLERGY",
  "GLUTEN_FREE",
  "NO_ICE",
] as const;
export type QuickNote = (typeof QUICK_NOTES)[number];

export interface MenuItem {
  id: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isArchived: boolean;
  imageUrl: string | null;
  options: MenuOptions | null;
}

export interface Category {
  id: string;
  nameFr: string;
  nameEn: string;
  order: number;
  station: Station;
  items: MenuItem[];
}

/** Options figées sur une ligne de bon (anciennes commandes : libellés simples). */
export interface OrderItemModifiers {
  cooking?: Label | string;
  side?: Label | string;
  extras?: (Extra | { name: string; price: number })[];
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  nameFr: string;
  nameEn: string;
  quantity: number;
  unitPrice: number;
  quickNotes: QuickNote[];
  notes: string | null;
  modifiers: OrderItemModifiers | null;
  station: Station;
}

export interface Order {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  totalAmount: number;
  customerNote: string | null;
  language: OrderLanguage;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  table: { id: string; number: number; zone: string } | null;
  /** null : commande passée par le client (QR code) */
  server: { id: string; name: string } | null;
  source: OrderSource;
  items: OrderItem[];
}

/** Ligne envoyée au serveur lors de l'événement `new_order`. */
export interface NewOrderLine {
  menuItemId: string;
  quantity: number;
  notes?: string;
  quickNotes: QuickNote[];
  cooking?: string;
  side?: string;
  extras: string[];
}

export interface NewOrderPayload {
  type: OrderType;
  language: OrderLanguage;
  tableId?: string;
  customerNote?: string;
  items: NewOrderLine[];
}

// ---------------------------------------------------------------------------
// Caisse
// ---------------------------------------------------------------------------

export type PaymentMode = "CASH" | "CARD" | "ORANGE_MONEY" | "TELECEL_CASH";

export interface BillSummary {
  total: number;
  paid: number;
  remaining: number;
  orderCount: number;
  inKitchen: number;
  since: string | null;
}

export interface CheckoutOverview {
  tables: (Omit<Table, "openOrders"> & { bill: BillSummary })[];
  takeaway: { id: string; number: number; type: OrderType; status: OrderStatus; server: string | null; bill: BillSummary }[];
}

export interface BillOrderItem extends OrderItem {
  paidQuantity: number;
}

export interface BillPayment {
  id: string;
  number: number;
  amount: number;
  mode: PaymentMode;
  amountReceived: number;
  changeReturned: number;
  reference: string | null;
  label: string | null;
  createdAt: string;
  cashier: { id: string; name: string };
}

export interface BillDiscount {
  id: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  amount: number;
  reason: string;
  createdAt: string;
  cashier: { id: string; name: string };
}

export interface Bill {
  target:
    | { kind: "table"; table: { id: string; number: number; zone: string; status: TableStatus } }
    | { kind: "order"; order: { id: string; number: number; type: OrderType } };
  orders: (Omit<Order, "items"> & { items: BillOrderItem[] })[];
  payments: BillPayment[];
  discounts: BillDiscount[];
  totals: { total: number; discounted: number; paid: number; remaining: number; unpaidItemsAmount: number };
  inKitchen: number;
}

export interface PayRequest {
  tableId?: string;
  orderId?: string;
  mode: PaymentMode;
  amount?: number;
  items?: { orderItemId: string; quantity: number }[];
  amountReceived?: number;
  reference?: string;
  label?: string;
}

export interface PayResponse {
  paymentId: string;
  ticketNumber: number;
  amount: number;
  changeReturned: number;
  remaining: number;
  closed: boolean;
  tableReleased: boolean;
}

export interface Receipt {
  restaurant: { name: string; address: string; phone: string; nif: string; rccm: string; footer: string; footerEn: string; currency: string };
  ticketNumber: number;
  createdAt: string;
  cashier: string;
  servers: string[];
  table: number | null;
  orderType: OrderType;
  /** Langue du client : langue par défaut du ticket */
  language: OrderLanguage;
  orderNumbers: number[];
  lines: { id: string; nameFr: string; nameEn: string; quantity: number; unitPrice: number; total: number; modifiers: OrderItemModifiers | null }[];
  paidLines: { nameFr: string; nameEn: string; quantity: number; amount: number }[];
  payment: {
    mode: PaymentMode;
    label: string | null;
    amount: number;
    amountReceived: number;
    changeReturned: number;
    reference: string | null;
  };
  history: { number: number; mode: PaymentMode; amount: number; label: string | null; createdAt: string }[];
  discounts: { reason: string; amount: number; percent: number | null }[];
  totals: { total: number; discounted: number; paidBefore: number; paidNow: number; remainingAfter: number };
}

// ---------------------------------------------------------------------------
// Gérant
// ---------------------------------------------------------------------------

export interface DailyStats {
  date: string;
  timezone: string;
  revenue: {
    today: number;
    previousDay: number;
    comparedTo: number;
    comparison: "same_time_yesterday" | "previous_day";
    changePct: number | null;
    payments: number;
  };
  orders: { created: number; served: number; cancelled: number; english: number };
  bills: { settled: number; dineIn: number; takeaway: number; averageAmount: number };
  outstanding: number;
  discounts: { amount: number; count: number };
  paymentsByMode: { mode: PaymentMode; amount: number; count: number }[];
  hourly: { hour: number; revenue: number; orders: number; items: number }[];
}

export interface TopItem {
  menuItemId: string;
  nameFr: string;
  nameEn: string;
  station: Station;
  quantity: number;
  revenue: number;
  orders: number;
}

export interface TopItems {
  date: string;
  period: "day" | "week" | "month";
  byQuantity: TopItem[];
  byRevenue: TopItem[];
}

export interface AdminMenuItem extends MenuItem {
  timesOrdered: number;
  deletable: boolean;
}

export interface AdminCategory extends Omit<Category, "items"> {
  items: AdminMenuItem[];
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type AuditAction =
  | "ORDER_CANCELLED"
  | "DISCOUNT_APPLIED"
  | "MENU_PRICE_CHANGED"
  | "MENU_ITEM_CREATED"
  | "MENU_ITEM_DELETED"
  | "PIN_RESET"
  | "USER_CREATED"
  | "USER_ROLE_CHANGED"
  | "USER_STATUS_CHANGED"
  | "LOGIN_LOCKED"
  | "TABLE_QR_REGENERATED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_REVOKED"
  | "ACCESS_DENIED"
  | "MENU_ITEM_UPDATED"
  | "MENU_CATEGORY_CHANGED"
  | "TABLE_CHANGED";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  details: Record<string, unknown>;
  timestamp: string;
  ipAddress: string | null;
  user: { id: string; name: string; role: Role } | null;
}

/** Table vue par le gérant (plan de salle & QR codes). */
export interface AdminTable {
  id: string;
  number: number;
  capacity: number;
  zone: string;
  status: TableStatus;
  qrToken: string;
  callRequestedAt: string | null;
  billRequestedAt: string | null;
  deletable: boolean;
}

export interface ReviewsSummary {
  count: number;
  average: number | null;
  distribution: { rating: number; count: number }[];
  items: { id: string; rating: number; comment: string | null; language: OrderLanguage; createdAt: string; table: number; order: number | null }[];
}

/** Alerte d'un client (QR) relayée aux tablettes : appel serveur ou demande d'addition. */
export interface StaffAlert {
  tableId: string;
  number: number;
  kind: "CALL" | "BILL";
  requestedAt: string;
}

// ---------------------------------------------------------------------------
// Portail client (QR code)
// ---------------------------------------------------------------------------

export interface PublicOrder {
  id: string;
  number: number;
  status: OrderStatus;
  source: OrderSource;
  totalAmount: number;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  items: Pick<OrderItem, "id" | "nameFr" | "nameEn" | "quantity" | "unitPrice" | "modifiers" | "quickNotes" | "notes">[];
}

export interface PublicTable {
  number: number;
  zone: string;
  status: TableStatus;
  callRequestedAt: string | null;
  billRequestedAt: string | null;
}

export interface Portal {
  restaurant: { name: string; currency: string };
  /** false : carte consultable, commande en ligne désactivée par le restaurant */
  ordering: boolean;
  table: PublicTable;
  menu: Category[];
  orders: PublicOrder[];
  reviewedOrderIds: string[];
}
