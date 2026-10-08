import { motion } from "framer-motion";
import { ChefHat, Clock, ShoppingBag, Truck } from "lucide-react";
import { formatPrice, formatTime } from "../../lib/format";
import { useTranslation } from "react-i18next";
import type { CheckoutOverview } from "../../types";

export type FloorFilter = "ALL" | "DUE" | "TAKEAWAY";
export type CheckoutTarget = { kind: "table"; id: string } | { kind: "order"; id: string };

const FILTERS: { value: FloorFilter; label: "cashier.filterAll" | "cashier.filterDue" | "common.takeaway" }[] = [
  { value: "ALL", label: "cashier.filterAll" },
  { value: "DUE", label: "cashier.filterDue" },
  { value: "TAKEAWAY", label: "common.takeaway" },
];

export function FloorPlan({
  overview,
  filter,
  onFilter,
  selected,
  onSelect,
}: {
  overview: CheckoutOverview;
  filter: FloorFilter;
  onFilter: (f: FloorFilter) => void;
  selected: CheckoutTarget | null;
  onSelect: (t: CheckoutTarget) => void;
}) {
  const { t } = useTranslation();
  const due = overview.tables.filter((tb) => tb.bill.remaining > 0);
  const tables = filter === "DUE" ? due : filter === "ALL" ? overview.tables : [];
  const takeaway = filter === "ALL" || filter === "TAKEAWAY" ? overview.takeaway.filter((tb) => tb.bill.remaining > 0) : [];
  const counts: Record<FloorFilter, number> = {
    ALL: overview.tables.length,
    DUE: due.length,
    TAKEAWAY: overview.takeaway.filter((tb) => tb.bill.remaining > 0).length,
  };
  const totalDue = due.reduce((s, tb) => s + tb.bill.remaining, 0) + overview.takeaway.reduce((s, tb) => s + tb.bill.remaining, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-slate-200 p-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilter(f.value)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[13px] font-semibold whitespace-nowrap ${
                filter === f.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {t(f.label)}
              <span className={`rounded-full px-2 text-[11px] ${filter === f.value ? "bg-brand-100 text-brand-700" : "bg-slate-200"}`}>
                {counts[f.value]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-baseline justify-between px-1 text-sm">
          <span className="text-slate-500">{t("cashier.outstandingTotal")}</span>
          <span className="font-bold">{formatPrice(totalDue)}</span>
        </div>
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto p-3 sm:grid-cols-4 lg:grid-cols-3">
        {tables.map((tb) => {
          const active = selected?.kind === "table" && selected.id === tb.id;
          const hasDue = tb.bill.remaining > 0;
          const settledInKitchen = !hasDue && tb.status === "OCCUPIED";
          return (
            <motion.button
              key={tb.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect({ kind: "table", id: tb.id })}
              className={`relative flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 p-1 transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : hasDue
                    ? "border-brand-300 bg-brand-50 hover:border-brand-500"
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-400"
              }`}
            >
              <span className="text-2xl font-bold">{tb.number}</span>
              {hasDue ? (
                <span className={`text-xs font-semibold ${active ? "text-brand-300" : "text-brand-700"}`}>
                  {formatPrice(tb.bill.remaining)}
                </span>
              ) : (
                <span className="text-[11px]">{settledInKitchen ? t("cashier.settled") : t(`tableStatus.${tb.status === "RESERVED" ? "RESERVED" : "FREE"}`)}</span>
              )}
              {tb.bill.inKitchen > 0 && (
                <ChefHat size={13} className="absolute right-1.5 top-1.5 text-amber-500" aria-label={t("cashier.dishesInKitchen")} />
              )}
              {tb.bill.paid > 0 && hasDue && (
                <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-500" title={t("cashier.depositPaid")} />
              )}
            </motion.button>
          );
        })}

        {takeaway.map((o) => {
          const active = selected?.kind === "order" && selected.id === o.id;
          return (
            <motion.button
              key={o.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect({ kind: "order", id: o.id })}
              className={`col-span-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${
                active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              {o.type === "DELIVERY" ? <Truck size={20} /> : <ShoppingBag size={20} />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t("common.ticket", { number: o.number })}</div>
                <div className={`flex items-center gap-1 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                  {o.server}
                  {o.bill.since && (
                    <>
                      · <Clock size={11} /> {formatTime(o.bill.since)}
                    </>
                  )}
                </div>
              </div>
              <span className="font-bold">{formatPrice(o.bill.remaining)}</span>
            </motion.button>
          );
        })}

        {tables.length === 0 && takeaway.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400">{t("cashier.nothingDue")}</p>
        )}
      </div>
    </div>
  );
}
