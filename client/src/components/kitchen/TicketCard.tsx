import { motion } from "framer-motion";
import { CheckCircle2, Clock, Flame, HandPlatter, Loader2, Martini, ShoppingBag, Undo2 } from "lucide-react";
import { formatElapsed, formatTime, minutesSince } from "../../lib/format";
import { modifiersText } from "../OrderItemLine";
import type { Order, OrderStatus, Station } from "../../types";

/** Code couleur d'ancienneté : vert < 10 min, orange < 20 min, rouge ≥ 20 min. */
export function ageLevel(minutes: number): "ok" | "warn" | "late" {
  if (minutes < 10) return "ok";
  if (minutes < 20) return "warn";
  return "late";
}

const ageStyle = {
  ok: { bar: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  warn: { bar: "bg-amber-500", text: "text-amber-400", ring: "ring-amber-500/40" },
  late: { bar: "bg-red-600", text: "text-red-400", ring: "ring-red-500/60" },
};

const actions: Partial<Record<OrderStatus, { next: OrderStatus; label: string; Icon: typeof Flame; cls: string }>> = {
  PENDING: { next: "PREPARING", label: "Lancer", Icon: Flame, cls: "bg-amber-500 hover:bg-amber-400 text-slate-950" },
  PREPARING: { next: "READY", label: "Prête", Icon: CheckCircle2, cls: "bg-emerald-500 hover:bg-emerald-400 text-slate-950" },
  READY: { next: "SERVED", label: "Servie", Icon: HandPlatter, cls: "bg-sky-500 hover:bg-sky-400 text-slate-950" },
};

export function TicketCard({
  order,
  now,
  station,
  busy,
  isNew,
  onAction,
}: {
  order: Order;
  now: number;
  station: Station | "ALL";
  busy: boolean;
  isNew: boolean;
  onAction: (order: Order, status: OrderStatus) => void;
}) {
  // Une fois prête, le chrono s'arrête : on mesure le temps de préparation
  const reference = order.status === "READY" && order.readyAt ? new Date(order.readyAt).getTime() : now;
  const minutes = minutesSince(order.createdAt, reference);
  const level = order.status === "READY" ? "ok" : ageLevel(minutes);
  const style = ageStyle[level];
  const items = station === "ALL" ? order.items : order.items.filter((i) => i.station === station);
  const action = actions[order.status];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.9, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", damping: 24, stiffness: 300 }}
      className={`overflow-hidden rounded-xl bg-slate-800 ring-2 ${style.ring} ${isNew ? "animate-pulse" : ""} ${
        level === "late" && order.status !== "READY" ? "shadow-lg shadow-red-900/40" : ""
      }`}
    >
      <div className={`h-1.5 ${style.bar}`} />
      <header className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div>
          <div className="flex items-center gap-2 text-xl font-bold text-white">
            {order.table ? (
              `Table ${order.table.number}`
            ) : (
              <>
                <ShoppingBag size={18} /> Emporter
              </>
            )}
          </div>
          <div className="text-xs text-slate-400">
            Bon #{order.number} · {order.server.name} · {formatTime(order.createdAt)}
          </div>
        </div>
        <div className={`flex items-center gap-1 font-mono text-lg font-bold tabular-nums ${style.text}`}>
          <Clock size={16} />
          {order.status === "READY" ? `${minutes} min` : formatElapsed(order.createdAt, now)}
        </div>
      </header>

      <ul className="space-y-1.5 px-3 py-3">
        {items.map((i) => {
          const details = modifiersText(i.modifiers);
          return (
            <li key={i.id} className="text-slate-100">
              <div className="flex gap-2">
                <span className="min-w-7 rounded bg-slate-700 text-center font-bold">{i.quantity}</span>
                <span className="flex-1 font-semibold leading-tight">
                  {i.name}
                  {station === "ALL" && i.station === "BAR" && <Martini size={14} className="ml-1 inline text-sky-400" />}
                </span>
              </div>
              {details && <div className="ml-9 text-sm text-slate-300">{details}</div>}
              {i.notes && <div className="ml-9 text-sm font-semibold text-amber-300">⚠ {i.notes}</div>}
            </li>
          );
        })}
      </ul>
      {order.customerNote && <p className="mx-3 mb-3 rounded bg-amber-500/15 px-2 py-1 text-sm text-amber-200">{order.customerNote}</p>}

      <footer className="flex gap-2 px-3 pb-3">
        {order.status === "READY" && (
          <button
            onClick={() => onAction(order, "PREPARING")}
            disabled={busy}
            className="rounded-lg bg-slate-700 px-3 text-slate-300 hover:bg-slate-600"
            aria-label="Remettre en préparation"
            title="Remettre en préparation"
          >
            <Undo2 size={18} />
          </button>
        )}
        {action && (
          <button
            onClick={() => onAction(order, action.next)}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-base font-bold disabled:opacity-60 ${action.cls}`}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <action.Icon size={18} />}
            {action.label}
          </button>
        )}
      </footer>
    </motion.article>
  );
}
