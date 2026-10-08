import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, ChefHat, Loader2, Minus, Plus, Send, Trash2 } from "lucide-react";
import { formatPrice, formatTime } from "../../lib/format";
import { cartTotal, lineUnitPrice, useCart } from "../../store/cart";
import { modifiersText } from "../OrderItemLine";
import type { Order, OrderStatus } from "../../types";

const statusBadge: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "bg-slate-200 text-slate-700" },
  PREPARING: { label: "En préparation", cls: "bg-amber-100 text-amber-800" },
  READY: { label: "Prête", cls: "bg-emerald-100 text-emerald-800" },
  SERVED: { label: "Servie", cls: "bg-sky-100 text-sky-800" },
  PAID: { label: "Payée", cls: "bg-slate-100 text-slate-500" },
  CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-700" },
};

export function CartPanel({
  sentOrders,
  sending,
  onSend,
  onMarkServed,
}: {
  sentOrders: Order[];
  sending: boolean;
  onSend: () => void;
  onMarkServed: (order: Order) => void;
}) {
  const { lines, setQuantity, clear } = useCart();
  const total = cartTotal(lines);
  const tableTotal = sentOrders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* Bons déjà envoyés pour cette table */}
        {sentOrders.length > 0 && (
          <section className="border-b border-slate-100 bg-slate-50 p-4">
            <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              Déjà envoyé <span>{formatPrice(tableTotal)}</span>
            </h3>
            <div className="space-y-2">
              {sentOrders.map((o) => (
                <div key={o.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      Bon #{o.number} <span className="font-normal text-slate-400">· {formatTime(o.createdAt)}</span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[o.status].cls}`}>
                      {statusBadge[o.status].label}
                    </span>
                  </div>
                  <ul className="text-slate-600">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        {i.quantity}× {i.name}
                      </li>
                    ))}
                  </ul>
                  {o.status === "READY" && (
                    <button
                      onClick={() => onMarkServed(o)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 font-medium text-white"
                    >
                      <CheckCheck size={16} /> Marquer servie
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nouvelle commande */}
        <section className="p-4">
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nouvelle commande
            {lines.length > 0 && (
              <button onClick={clear} className="flex items-center gap-1 normal-case text-red-500">
                <Trash2 size={13} /> Vider
              </button>
            )}
          </h3>
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Touchez un plat pour l'ajouter</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {lines.map((l) => {
                  const details = modifiersText({ cooking: l.cooking, side: l.side, extras: l.extras });
                  return (
                    <motion.li
                      key={l.key}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-start gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight">{l.item.name}</div>
                        {details && <div className="text-xs text-slate-500">{details}</div>}
                        {l.notes && <div className="text-xs font-medium text-amber-700">⚠ {l.notes}</div>}
                        <div className="mt-1 text-sm text-slate-500">{formatPrice(lineUnitPrice(l) * l.quantity)}</div>
                      </div>
                      <div className="flex items-center rounded-lg bg-slate-100">
                        <button className="p-2" onClick={() => setQuantity(l.key, l.quantity - 1)} aria-label="Moins">
                          {l.quantity === 1 ? <Trash2 size={15} className="text-red-500" /> : <Minus size={15} />}
                        </button>
                        <span className="w-6 text-center font-semibold">{l.quantity}</span>
                        <button className="p-2" onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label="Plus">
                          <Plus size={15} />
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-slate-500">Total commande</span>
          <span className="text-2xl font-bold">{formatPrice(total)}</span>
        </div>
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={lines.length === 0 || sending}
          onClick={onSend}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-lg font-semibold text-white hover:bg-brand-600 disabled:bg-slate-300"
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          Envoyer en cuisine
          <ChefHat size={20} />
        </motion.button>
      </div>
    </div>
  );
}
