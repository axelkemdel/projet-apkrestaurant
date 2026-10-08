import { AnimatePresence, motion } from "framer-motion";
import { Clock, Smartphone, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatTime } from "../../lib/format";
import { itemName, modifiersText, quickNotesText, useLang } from "../../lib/localize";
import type { PublicOrder } from "../../types";

export const STEPS = ["PENDING", "PREPARING", "READY", "SERVED"] as const;
type Step = (typeof STEPS)[number];
const EMOJI: Record<Step, string> = { PENDING: "⏳", PREPARING: "👨‍🍳", READY: "🔔", SERVED: "✅" };

/** Étape affichée au client (un bon soldé est forcément servi). */
export function stepOf(order: Pick<PublicOrder, "status">): number {
  if (order.status === "PAID") return 3;
  return Math.max(0, STEPS.indexOf(order.status as Step));
}

/** Suivi en direct des bons de la table : barre de progression en 4 étapes par bon. */
export function OrderTracker({ orders, money }: { orders: PublicOrder[]; money: (n: number) => string }) {
  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {[...orders].reverse().map((o) => (
          <motion.li
            key={o.id}
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
          >
            <OrderCard order={o} money={money} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function OrderCard({ order, money }: { order: PublicOrder; money: (n: number) => string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const step = stepOf(order);
  const current = STEPS[step];
  const SourceIcon = order.source === "CUSTOMER" ? Smartphone : UserRound;

  return (
    <>
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <div className="font-bold text-slate-900">{t("portal.orderNumber", { number: order.number })}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Clock size={12} /> {formatTime(order.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <SourceIcon size={12} /> {t(`portal.orderBy.${order.source}`)}
            </span>
          </div>
        </div>
        <span className="whitespace-nowrap text-right font-bold tabular-nums text-slate-900">{money(order.totalAmount)}</span>
      </header>

      {/* Barre de progression : ⏳ Reçue → 👨‍🍳 En préparation → 🔔 Prête → ✅ Servie */}
      <div className="px-4 pt-4" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-valuetext={t(`portal.steps.${current}`)}>
        <div className="relative mx-4 h-1.5 rounded-full bg-slate-100">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${step === 3 ? "bg-emerald-500" : "bg-brand-500"}`}
            initial={false}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <ol className="-mt-[18px] flex justify-between">
          {STEPS.map((s, i) => {
            const done = i < step || (i === 3 && step === 3);
            const isCurrent = i === step && step !== 3;
            return (
              <li key={s} className="flex w-16 flex-col items-center text-center">
                <motion.span
                  initial={false}
                  animate={{ scale: isCurrent ? 1.12 : 1 }}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-base ring-4 ring-white ${
                    done ? (step === 3 ? "bg-emerald-100" : "bg-brand-100") : isCurrent ? "bg-brand-500" : "bg-slate-100 grayscale"
                  }`}
                >
                  {isCurrent && <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/40" />}
                  <span className={`relative ${!done && !isCurrent ? "opacity-40" : ""}`}>{EMOJI[s]}</span>
                </motion.span>
                <span className={`mt-1.5 text-[11px] font-semibold leading-tight ${i <= step ? "text-slate-800" : "text-slate-400"}`}>{t(`portal.steps.${s}`)}</span>
              </li>
            );
          })}
        </ol>
        <AnimatePresence mode="wait">
          <motion.p
            key={current}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-semibold ${
              current === "SERVED" ? "bg-emerald-50 text-emerald-700" : current === "READY" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"
            }`}
          >
            {EMOJI[current]} {t(`portal.stepsHint.${current}`)}
          </motion.p>
        </AnimatePresence>
      </div>

      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 px-4">
        {order.items.map((i) => {
          const details = [modifiersText(i.modifiers, lang), quickNotesText(i.quickNotes, t, lang), i.notes].filter(Boolean).join(" · ");
          return (
            <li key={i.id} className="flex items-start gap-3 py-2.5 text-sm">
              <span className="w-7 shrink-0 font-bold tabular-nums text-slate-900">{i.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">{itemName(i, lang)}</span>
                {details && <span className="block text-xs text-slate-500">{details}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">{money(i.unitPrice * i.quantity)}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
