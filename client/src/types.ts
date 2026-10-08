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
