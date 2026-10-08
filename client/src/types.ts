// Types partagés avec l'API (miroir du schéma Prisma côté serveur)

export type Role = "ADMIN" | "SERVEUR" | "CUISINE" | "CAISSE";
export type TableStatus = "FREE" | "OCCUPIED" | "RESERVED";
export type OrderStatus = "PENDING" | "PREPARING" | "READY" | "SERVED" | "PAID" | "CANCELLED";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type Station = "KITCHEN" | "BAR";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface Table {
  id: string;
  number: number;
  capacity: number;
  zone: string;
  status: TableStatus;
  openOrders: number;
}

export interface Extra {
  name: string;
  price: number;
}

export interface MenuOptions {
  cooking?: string[];
  sides?: string[];
  extras?: Extra[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isArchived: boolean;
  imageUrl: string | null;
  options: MenuOptions | null;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  station: Station;
  items: MenuItem[];
}

export interface OrderItemModifiers {
  cooking?: string;
  side?: string;
  extras?: Extra[];
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
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
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  table: { id: string; number: number; zone: string } | null;
  server: { id: string; name: string };
  items: OrderItem[];
}

/** Ligne envoyée au serveur lors de l'événement `new_order`. */
export interface NewOrderLine {
  menuItemId: string;
  quantity: number;
  notes?: string;
  cooking?: string;
  side?: string;
  extras: string[];
}

export interface NewOrderPayload {
  type: OrderType;
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
  takeaway: { id: string; number: number; type: OrderType; status: OrderStatus; server: string; bill: BillSummary }[];
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

export interface Bill {
  target:
    | { kind: "table"; table: { id: string; number: number; zone: string; status: TableStatus } }
    | { kind: "order"; order: { id: string; number: number; type: OrderType } };
  orders: (Omit<Order, "items"> & { items: BillOrderItem[] })[];
  payments: BillPayment[];
  totals: { total: number; paid: number; remaining: number; unpaidItemsAmount: number };
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
  restaurant: { name: string; address: string; phone: string; nif: string; rccm: string; footer: string; currency: string };
  ticketNumber: number;
  createdAt: string;
  cashier: string;
  servers: string[];
  table: number | null;
  orderType: OrderType;
  orderNumbers: number[];
  lines: { id: string; name: string; quantity: number; unitPrice: number; total: number; modifiers: OrderItemModifiers | null }[];
  paidLines: { name: string; quantity: number; amount: number }[];
  payment: {
    mode: PaymentMode;
    label: string | null;
    amount: number;
    amountReceived: number;
    changeReturned: number;
    reference: string | null;
  };
  history: { number: number; mode: PaymentMode; amount: number; label: string | null; createdAt: string }[];
  totals: { total: number; paidBefore: number; paidNow: number; remainingAfter: number };
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
  orders: { created: number; served: number; cancelled: number };
  bills: { settled: number; dineIn: number; takeaway: number; averageAmount: number };
  outstanding: number;
  paymentsByMode: { mode: PaymentMode; amount: number; count: number }[];
  hourly: { hour: number; revenue: number; orders: number; items: number }[];
}

export interface TopItem {
  menuItemId: string;
  name: string;
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
  role: Role;
  isActive: boolean;
  createdAt: string;
}
