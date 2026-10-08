import { AnimatePresence, motion } from "framer-motion";
import { Check, ChefHat, Minus, Plus, Printer } from "lucide-react";
import { formatPrice, formatTime, paymentModeLabel } from "../../lib/format";
import { modifiersText } from "../OrderItemLine";
import type { Bill, BillDiscount, BillPayment, OrderStatus } from "../../types";

export type ItemSelection = Record<string, number>;

const statusLabel: Partial<Record<OrderStatus, { label: string; cls: string }>> = {
  PENDING: { label: "En attente cuisine", cls: "bg-slate-200 text-slate-700" },
  PREPARING: { label: "En préparation", cls: "bg-amber-100 text-amber-800" },
  READY: { label: "Prête", cls: "bg-emerald-100 text-emerald-800" },
  SERVED: { label: "Servie", cls: "bg-sky-100 text-sky-800" },
};

/**
 * Détail de l'addition. En mode sélection, chaque touche sur un article ajoute
 * une unité à la part du client ; − / + ajustent la quantité.
 */
export function BillItems({
  bill,
  selectable,
  selection,
  onSelectionChange,
}: {
  bill: Bill;
  selectable: boolean;
  selection: ItemSelection;
  onSelectionChange: (s: ItemSelection) => void;
}) {
  const allItems = bill.orders.flatMap((o) => o.items);

  function setQty(id: string, qty: number, max: number) {
    const next = { ...selection };
    const q = Math.max(0, Math.min(max, qty));
    if (q === 0) delete next[id];
    else next[id] = q;
    onSelectionChange(next);
  }

  function selectAll() {
    const next: ItemSelection = {};
    allItems.forEach((i) => {
      const left = i.quantity - i.paidQuantity;
      if (left > 0) next[i.id] = left;
    });
    onSelectionChange(next);
  }

  return (
    <div className="space-y-3">
      {selectable && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
          <span>Touchez les articles réglés par ce client</span>
          <span className="flex gap-3 font-semibold">
            <button onClick={selectAll}>Tout</button>
            <button onClick={() => onSelectionChange({})}>Aucun</button>
          </span>
        </div>
      )}

      {bill.orders.map((order) => {
        const st = statusLabel[order.status];
        return (
          <section key={order.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold">
                Bon #{order.number}
                <span className="font-normal text-slate-500">
                  {" "}
                  · {order.server.name} · {formatTime(order.createdAt)}
                </span>
              </span>
              {st && (
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                  {(order.status === "PENDING" || order.status === "PREPARING") && <ChefHat size={12} />}
                  {st.label}
                </span>
              )}
            </header>
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const left = item.quantity - item.paidQuantity;
                const picked = selection[item.id] ?? 0;
                const details = modifiersText(item.modifiers);
                const fullyPaid = left === 0;
                return (
                  <li
                    key={item.id}
                    onClick={selectable && !fullyPaid ? () => setQty(item.id, picked + 1, left) : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      selectable && !fullyPaid ? "cursor-pointer active:bg-brand-50" : ""
                    } ${picked > 0 ? "bg-brand-50" : ""} ${fullyPaid ? "text-slate-400" : ""}`}
                  >
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center rounded-md text-sm font-bold ${
                        fullyPaid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100"
                      }`}
                    >
                      {fullyPaid ? <Check size={15} /> : item.quantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`font-medium leading-tight ${fullyPaid ? "line-through" : ""}`}>{item.name}</div>
                      {details && <div className="text-xs text-slate-500">{details}</div>}
                      {item.paidQuantity > 0 && !fullyPaid && (
                        <div className="text-xs font-medium text-emerald-700">
                          {item.paidQuantity} réglé{item.paidQuantity > 1 ? "s" : ""} · reste {left}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold">{formatPrice(item.unitPrice * item.quantity)}</div>
                      {item.quantity > 1 && <div className="text-xs text-slate-400">{formatPrice(item.unitPrice)} /u</div>}
                    </div>
                    <AnimatePresence>
                      {selectable && picked > 0 && (
                        <motion.div
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: "auto", opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          className="flex items-center overflow-hidden rounded-lg bg-brand-500 text-white"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button className="p-1.5" onClick={() => setQty(item.id, picked - 1, left)} aria-label="Retirer">
                            <Minus size={14} />
                          </button>
                          <span className="w-5 text-center text-sm font-bold">{picked}</span>
                          <button className="p-1.5" onClick={() => setQty(item.id, picked + 1, left)} aria-label="Ajouter">
                            <Plus size={14} />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function PaymentHistory({
  payments,
  discounts = [],
  onReprint,
}: {
  payments: BillPayment[];
  discounts?: BillDiscount[];
  onReprint: (id: string) => void;
}) {
  if (payments.length === 0 && discounts.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Versements et remises
      </h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {discounts.map((d) => (
          <li key={d.id} className="flex items-center gap-3 bg-amber-50/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                Remise {d.kind === "PERCENT" ? `${d.value} %` : ""}
                <span className="font-normal text-slate-500"> · {d.reason}</span>
              </div>
              <div className="text-xs text-slate-500">
                {formatTime(d.createdAt)} · {d.cashier.name}
              </div>
            </div>
            <span className="font-semibold text-amber-700">−{formatPrice(d.amount)}</span>
            <span className="w-9" />
          </li>
        ))}
        {payments.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {paymentModeLabel[p.mode]}
                {p.label && <span className="font-normal text-slate-500"> · {p.label}</span>}
              </div>
              <div className="text-xs text-slate-500">
                Ticket #{p.number} · {formatTime(p.createdAt)} · {p.cashier.name}
              </div>
            </div>
            <span className="font-semibold text-emerald-700">{formatPrice(p.amount)}</span>
            <button
              onClick={() => onReprint(p.id)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label={`Réimprimer le ticket ${p.number}`}
            >
              <Printer size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
