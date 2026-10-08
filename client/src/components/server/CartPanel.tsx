import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, ChefHat, Loader2, Minus, Plus, Send, Trash2 } from "lucide-react";
import { formatPrice, formatTime } from "../../lib/format";
import { cartTotal, lineUnitPrice, useCart } from "../../store/cart";
import { useTranslation } from "react-i18next";
import { itemName, modifiersText, quickNotesText, useLang } from "../../lib/localize";
import type { Order, OrderStatus } from "../../types";

const statusBadge: Record<OrderStatus, string> = {
  PENDING: "bg-slate-200 text-slate-700",
  PREPARING: "bg-amber-100 text-amber-800",
  READY: "bg-emerald-100 text-emerald-800",
  SERVED: "bg-sky-100 text-sky-800",
  PAID: "bg-slate-100 text-slate-500",
  CANCELLED: "bg-red-100 text-red-700",
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
  const { t } = useTranslation();
  const lang = useLang();
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
              {t("order.alreadySent")} <span>{formatPrice(tableTotal)}</span>
            </h3>
            <div className="space-y-2">
              {sentOrders.map((o) => (
                <div key={o.id} className="rounded-xl bg-white p-3 text-sm shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {t("common.ticket", { number: o.number })} <span className="font-normal text-slate-400">· {formatTime(o.createdAt)}</span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[o.status]}`}>{t(`status.${o.status}`)}</span>
                  </div>
                  <ul className="text-slate-600">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        {i.quantity}× {itemName(i, lang)}
                      </li>
                    ))}
                  </ul>
                  {o.status === "READY" && (
                    <button
                      onClick={() => onMarkServed(o)}
                      className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 font-medium text-white"
                    >
                      <CheckCheck size={16} /> {t("order.markServed")}
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
            {t("order.newOrder")}
            {lines.length > 0 && (
              <button onClick={clear} className="flex min-h-10 items-center gap-1 px-1 normal-case text-red-500">
                <Trash2 size={13} /> {t("order.clearCart")}
              </button>
            )}
          </h3>
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("order.tapToAdd")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              <AnimatePresence initial={false}>
                {lines.map((l) => {
                  const details = modifiersText({ cooking: l.cooking, side: l.side, extras: l.extras }, lang);
                  const quick = quickNotesText(l.quickNotes, t, lang);
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
                        <div className="font-medium leading-tight">{itemName(l.item, lang)}</div>
                        {details && <div className="text-xs text-slate-500">{details}</div>}
                        {quick && <div className="text-xs font-medium text-amber-700">⚠ {quick}</div>}
                        {l.notes && <div className="text-xs font-medium text-amber-700">📝 {l.notes}</div>}
                        <div className="mt-1 text-sm text-slate-500">{formatPrice(lineUnitPrice(l) * l.quantity)}</div>
                      </div>
                      <div className="flex items-center rounded-lg bg-slate-100">
                        <button className="flex h-11 w-11 items-center justify-center" onClick={() => setQuantity(l.key, l.quantity - 1)} aria-label={t("order.less")}>
                          {l.quantity === 1 ? <Trash2 size={15} className="text-red-500" /> : <Minus size={15} />}
                        </button>
                        <span className="w-6 text-center font-semibold">{l.quantity}</span>
                        <button className="flex h-11 w-11 items-center justify-center" onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label={t("order.more")}>
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
          <span className="text-slate-500">{t("order.orderTotal")}</span>
          <span className="text-2xl font-bold">{formatPrice(total)}</span>
        </div>
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={lines.length === 0 || sending}
          onClick={onSend}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-lg font-semibold text-white hover:bg-brand-600 disabled:bg-slate-300"
        >
          {sending ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          {t("order.sendToKitchen")}
          <ChefHat size={20} />
        </motion.button>
      </div>
    </div>
  );
}
