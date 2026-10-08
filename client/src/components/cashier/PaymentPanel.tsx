import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Check, CreditCard, Delete, Loader2, Minus, Plus, Smartphone, Users } from "lucide-react";
import { formatPrice } from "../../lib/format";
import { useTranslation } from "react-i18next";
import type { Bill, PaymentMode, PayRequest } from "../../types";
import type { ItemSelection } from "./BillItems";

export type SplitMode = "FULL" | "EQUAL" | "ITEMS" | "CUSTOM";

const SPLITS: { value: SplitMode; label: "pay.full" | "pay.equal" | "pay.items" | "pay.custom" }[] = [
  { value: "FULL", label: "pay.full" },
  { value: "EQUAL", label: "pay.equal" },
  { value: "ITEMS", label: "pay.items" },
  { value: "CUSTOM", label: "pay.custom" },
];

const MODES: { value: PaymentMode; Icon: typeof Banknote; accent: string }[] = [
  { value: "CASH", Icon: Banknote, accent: "border-emerald-500 bg-emerald-50 text-emerald-800" },
  { value: "CARD", Icon: CreditCard, accent: "border-sky-500 bg-sky-50 text-sky-800" },
  { value: "ORANGE_MONEY", Icon: Smartphone, accent: "border-orange-500 bg-orange-50 text-orange-800" },
  { value: "TELECEL_CASH", Icon: Smartphone, accent: "border-violet-500 bg-violet-50 text-violet-800" },
];

const PART_LABEL = /^Part (\d+)\/(\d+)$/;

/** Montants rapides proposés pour les espèces (billets FCFA courants). */
function quickCashAmounts(amount: number): number[] {
  const roundUp = (step: number) => Math.ceil(amount / step) * step;
  return [...new Set([amount, roundUp(500), roundUp(1000), roundUp(5000), roundUp(10000)])]
    .filter((v) => v >= amount)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

export function PaymentPanel({
  bill,
  split,
  onSplitChange,
  selection,
  submitting,
  onSubmit,
}: {
  bill: Bill;
  split: SplitMode;
  onSplitChange: (s: SplitMode) => void;
  selection: ItemSelection;
  submitting: boolean;
  onSubmit: (req: Omit<PayRequest, "tableId" | "orderId">) => void;
}) {
  const { t } = useTranslation();
  const remaining = bill.totals.remaining;
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [received, setReceived] = useState("");
  const [custom, setCustom] = useState("");
  const [reference, setReference] = useState("");
  const [focus, setFocus] = useState<"amount" | "received">("received");

  // --- Division égale : le nombre de parts est retrouvé depuis les versements déjà faits
  const lastSplit = useMemo(() => {
    for (const p of [...bill.payments].reverse()) {
      const m = p.label?.match(PART_LABEL);
      if (m) return Number(m[2]);
    }
    return null;
  }, [bill.payments]);
  const [persons, setPersons] = useState(lastSplit ?? 2);
  useEffect(() => {
    if (lastSplit) setPersons(lastSplit);
  }, [lastSplit]);
  const partsPaid = bill.payments.filter((p) => p.label?.match(PART_LABEL)?.[2] === String(persons)).length;
  const partsLeft = Math.max(1, persons - partsPaid);
  // Arrondi au franc supérieur ; la dernière part absorbe l'écart et tombe pile sur le solde
  const share = Math.ceil(remaining / partsLeft);

  // --- Paiement par articles
  const itemsById = useMemo(() => new Map(bill.orders.flatMap((o) => o.items).map((i) => [i.id, i])), [bill.orders]);
  const selectedEntries = Object.entries(selection).filter(([id, q]) => q > 0 && itemsById.has(id));
  const itemsAmount = selectedEntries.reduce((s, [id, q]) => s + q * itemsById.get(id)!.unitPrice, 0);
  const itemsCount = selectedEntries.reduce((s, [, q]) => s + q, 0);

  const amount =
    split === "FULL" ? remaining : split === "EQUAL" ? share : split === "ITEMS" ? itemsAmount : Number(custom || 0);
  const receivedValue = received === "" ? amount : Number(received);
  const change = mode === "CASH" ? receivedValue - amount : 0;

  // Réinitialisation de la saisie à chaque changement de type de division
  // (le parent remonte le composant à chaque nouvelle addition / après un encaissement)
  useEffect(() => {
    setReceived("");
    setCustom("");
  }, [split]);
  useEffect(() => {
    setFocus(split === "CUSTOM" ? "amount" : "received");
  }, [split]);
  useEffect(() => {
    if (mode !== "CASH" && focus === "received") setReceived("");
  }, [mode, focus]);

  const keypadTarget = focus === "amount" && split === "CUSTOM" ? "amount" : mode === "CASH" ? "received" : null;

  function press(key: string) {
    const set = keypadTarget === "amount" ? setCustom : setReceived;
    set((cur) => {
      if (key === "C") return "";
      if (key === "⌫") return cur.slice(0, -1);
      const next = (cur + key).replace(/^0+/, "");
      return next.length > 9 ? cur : next;
    });
  }

  let error: string | null = null;
  if (amount <= 0) error = split === "ITEMS" ? t("pay.selectItems") : t("pay.enterAmount");
  else if (amount > remaining) error = t("pay.exceedsBalance", { remaining: formatPrice(remaining) });
  else if (mode === "CASH" && receivedValue < amount) error = t("pay.cashInsufficient");

  function submit() {
    if (error) return;
    const label =
      split === "EQUAL"
        ? `Part ${partsPaid + 1}/${persons}`
        : split === "CUSTOM" && amount < remaining
          ? "Acompte"
          : undefined;
    onSubmit({
      mode,
      ...(split === "ITEMS"
        ? { items: selectedEntries.map(([orderItemId, quantity]) => ({ orderItemId, quantity })) }
        : { amount }),
      ...(mode === "CASH" && { amountReceived: receivedValue }),
      ...(mode !== "CASH" && reference.trim() && { reference: reference.trim() }),
      label,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Type de division */}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          {SPLITS.map((s) => (
            <button
              key={s.value}
              onClick={() => onSplitChange(s.value)}
              className={`rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm ${
                split === s.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {t(s.label)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {split === "EQUAL" && (
            <motion.div
              key="equal"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Users size={16} /> {t("pay.persons")}
                </span>
                <div className="flex items-center rounded-xl bg-slate-100">
                  <button
                    className="flex h-11 w-11 items-center justify-center disabled:opacity-30"
                    disabled={persons <= Math.max(2, partsPaid + 1)}
                    onClick={() => setPersons((n) => n - 1)}
                    aria-label={t("pay.fewerPersons")}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-8 text-center text-lg font-bold">{persons}</span>
                  <button className="flex h-11 w-11 items-center justify-center" onClick={() => setPersons((n) => Math.min(30, n + 1))} aria-label={t("pay.morePersons")}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: persons }, (_, i) => {
                  const paid = i < partsPaid;
                  const current = i === partsPaid;
                  return (
                    <span
                      key={i}
                      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-bold ${
                        paid
                          ? "bg-emerald-500 text-white"
                          : current
                            ? "bg-brand-500 text-white ring-2 ring-brand-200"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {paid ? <Check size={14} /> : i + 1}
                    </span>
                  );
                })}
              </div>
              <p className="text-sm text-slate-500">
                {formatPrice(remaining)} ÷ {partsLeft} = <strong className="text-slate-900">{formatPrice(share)}</strong> {t("pay.perPerson")}
              </p>
            </motion.div>
          )}
          {split === "ITEMS" && (
            <motion.p
              key="items"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600"
            >
              {itemsCount === 0 ? t("pay.tapItems") : t("pay.itemsSelected", { count: itemsCount })}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Montant à encaisser */}
        <button
          onClick={() => split === "CUSTOM" && setFocus("amount")}
          className={`w-full rounded-2xl border-2 px-4 py-3 text-left ${
            keypadTarget === "amount" ? "border-brand-500 bg-brand-50" : "border-transparent bg-slate-900 text-white"
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wide ${keypadTarget === "amount" ? "text-brand-700" : "text-slate-400"}`}>
            {t("pay.toCollect")}
          </div>
          <div className="text-3xl font-black tabular-nums">{formatPrice(amount)}</div>
        </button>

        {/* Mode de paiement */}
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(({ value, Icon, accent }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold ${
                mode === value ? accent : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <Icon size={18} /> {t(`paymentModes.${value}`)}
            </button>
          ))}
        </div>

        {mode === "CASH" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFocus("received")}
                className={`rounded-xl border-2 px-3 py-2 text-left ${
                  keypadTarget === "received" ? "border-brand-500 bg-brand-50" : "border-slate-200"
                }`}
              >
                <div className="text-xs font-semibold uppercase text-slate-500">{t("pay.received")}</div>
                <div className="text-xl font-bold tabular-nums">{formatPrice(receivedValue)}</div>
              </button>
              <div
                className={`rounded-xl px-3 py-2 ${change > 0 ? "bg-emerald-600 text-white" : change < 0 ? "bg-red-50 text-red-700" : "bg-slate-100"}`}
              >
                <div className="text-xs font-semibold uppercase opacity-80">{t("pay.change")}</div>
                <div className="text-xl font-bold tabular-nums">{formatPrice(Math.max(0, change))}</div>
              </div>
            </div>
            {amount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickCashAmounts(amount).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setFocus("received");
                      setReceived(v === amount ? "" : String(v));
                    }}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200"
                  >
                    {v === amount ? t("pay.exact") : formatPrice(v)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              {mode === "CARD" ? t("pay.authCode") : t("pay.transactionRef")}
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={60}
              placeholder={mode === "CARD" ? t("pay.authCodeExample") : t("pay.transactionRefExample")}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono outline-none focus:border-brand-500"
            />
          </label>
        )}

        {/* Clavier numérique */}
        {keypadTarget && (
          <div className="grid grid-cols-4 gap-1.5">
            {["7", "8", "9", "⌫", "4", "5", "6", "C", "1", "2", "3", "00", "0", "000"].map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className={`flex h-12 items-center justify-center rounded-xl text-lg font-semibold active:scale-95 ${
                  k === "C" ? "bg-red-50 text-red-600" : k === "⌫" ? "bg-slate-200" : "bg-slate-100 hover:bg-slate-200"
                } ${k === "0" ? "col-span-2" : ""}`}
                aria-label={k === "⌫" ? t("pay.eraseDigit") : k === "C" ? t("pin.erase") : k}
              >
                {k === "⌫" ? <Delete size={20} /> : k}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-4">
        {error && amount !== 0 && <p className="mb-2 text-center text-sm font-medium text-red-600">{error}</p>}
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={Boolean(error) || submitting}
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-500 disabled:bg-slate-300"
        >
          {submitting ? <Loader2 className="animate-spin" /> : <Check />}
          {t("pay.collect")} {amount > 0 && formatPrice(amount)}
        </motion.button>
      </div>
    </div>
  );
}
