import { AnimatePresence, motion } from "framer-motion";
import { Check, ChefHat, Minus, Plus, Printer } from "lucide-react";
import { formatPrice, formatTime } from "../../lib/format";
import { useTranslation } from "react-i18next";
import { discountReason, formatPercent, itemName, modifiersText, paymentLabel, quickNotesText, useLang } from "../../lib/localize";
import type { Bill, BillDiscount, BillPayment, Lang, OrderStatus } from "../../types";

export type ItemSelection = Record<string, number>;

const statusLabel: Partial<Record<OrderStatus, { label: "cashier.waitingKitchen" | "status.PREPARING" | "status.READY" | "status.SERVED"; cls: string }>> = {
  PENDING: { label: "cashier.waitingKitchen", cls: "bg-slate-200 text-slate-700" },
  PREPARING: { label: "status.PREPARING", cls: "bg-amber-100 text-amber-800" },
  READY: { label: "status.READY", cls: "bg-emerald-100 text-emerald-800" },
  SERVED: { label: "status.SERVED", cls: "bg-sky-100 text-sky-800" },
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
  itemsLang,
}: {
  bill: Bill;
  selectable: boolean;
  selection: ItemSelection;
  onSelectionChange: (s: ItemSelection) => void;
  /** Langue d'affichage des articles (bascule FR/EN de la caisse) */
  itemsLang: Lang;
}) {
  const { t } = useTranslation();
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
          <span>{t("cashier.tapItemsPaid")}</span>
          <span className="flex gap-1 font-semibold">
            <button className="min-h-10 px-2" onClick={selectAll}>
              {t("common.all")}
            </button>
            <button className="min-h-10 px-2" onClick={() => onSelectionChange({})}>
              {t("common.none")}
            </button>
          </span>
        </div>
      )}

      {bill.orders.map((order) => {
        const st = statusLabel[order.status];
        return (
          <section key={order.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold">
                {t("common.ticket", { number: order.number })}
                <span className="font-normal text-slate-500">
                  {" "}
                  · {order.server.name} · {formatTime(order.createdAt)}
                </span>
              </span>
              {st && (
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                  {(order.status === "PENDING" || order.status === "PREPARING") && <ChefHat size={12} />}
                  {t(st.label)}
                </span>
              )}
            </header>
            <ul className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const left = item.quantity - item.paidQuantity;
                const picked = selection[item.id] ?? 0;
                const details = [modifiersText(item.modifiers, itemsLang), quickNotesText(item.quickNotes, t, itemsLang)].filter(Boolean).join(" · ");
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
                      <div className={`font-medium leading-tight ${fullyPaid ? "line-through" : ""}`}>{itemName(item, itemsLang)}</div>
                      {details && <div className="text-xs text-slate-500">{details}</div>}
                      {item.paidQuantity > 0 && !fullyPaid && (
                        <div className="text-xs font-medium text-emerald-700">
                          {t("cashier.paidLeft", { count: item.paidQuantity, left })}
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
                          <button className="flex h-10 w-10 items-center justify-center" onClick={() => setQty(item.id, picked - 1, left)} aria-label={t("order.less")}>
                            <Minus size={14} />
                          </button>
                          <span className="w-5 text-center text-sm font-bold">{picked}</span>
                          <button className="flex h-10 w-10 items-center justify-center" onClick={() => setQty(item.id, picked + 1, left)} aria-label={t("order.more")}>
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
  const { t } = useTranslation();
  const lang = useLang();
  if (payments.length === 0 && discounts.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("cashier.paymentsAndDiscounts")}
      </h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {discounts.map((d) => (
          <li key={d.id} className="flex items-center gap-3 bg-amber-50/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {t("cashier.discount")} {d.kind === "PERCENT" ? formatPercent(d.value, lang) : ""}
                <span className="font-normal text-slate-500"> · {discountReason(d.reason, lang)}</span>
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
                {t(`paymentModes.${p.mode}`)}
                {p.label && <span className="font-normal text-slate-500"> · {paymentLabel(p.label, t)}</span>}
              </div>
              <div className="text-xs text-slate-500">
                {t("cashier.receiptNumber", { number: p.number })} · {formatTime(p.createdAt)} · {p.cashier.name}
              </div>
            </div>
            <span className="font-semibold text-emerald-700">{formatPrice(p.amount)}</span>
            <button
              onClick={() => onReprint(p.id)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label={t("cashier.reprint", { number: p.number })}
            >
              <Printer size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
