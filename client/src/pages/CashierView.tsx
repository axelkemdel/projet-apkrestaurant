import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, ChefHat, Languages, Loader2, Printer, ReceiptText as ReceiptIcon, ShoppingBag } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { toast } from "../components/Toasts";
import { useTranslation } from "react-i18next";
import { useLang } from "../lib/localize";
import type { Lang } from "../types";
import { FloorPlan, type CheckoutTarget, type FloorFilter } from "../components/cashier/FloorPlan";
import { BillItems, PaymentHistory, type ItemSelection } from "../components/cashier/BillItems";
import { PaymentPanel, type SplitMode } from "../components/cashier/PaymentPanel";
import { ReceiptModal } from "../components/cashier/ReceiptModal";
import { DiscountModal } from "../components/cashier/DiscountModal";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useStaffAlerts } from "../lib/useStaffAlerts";
import { formatPrice } from "../lib/format";
import type { Bill, CheckoutOverview, PayRequest, PayResponse } from "../types";

function readAutoPrint(): boolean {
  try {
    return localStorage.getItem("cashier-autoprint") === "1";
  } catch {
    return false;
  }
}

export function CashierView() {
  // Demandes d'addition faites depuis le QR code des tables
  useStaffAlerts({ bill: true });
  const [overview, setOverview] = useState<CheckoutOverview | null>(null);
  const [filter, setFilter] = useState<FloorFilter>("DUE");
  const [target, setTarget] = useState<CheckoutTarget | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [loadingBill, setLoadingBill] = useState(false);
  const [split, setSplit] = useState<SplitMode>("FULL");
  const [selection, setSelection] = useState<ItemSelection>({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; auto: boolean } | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [autoPrint, setAutoPrint] = useState(readAutoPrint);
  const [discountOpen, setDiscountOpen] = useState(false);
  const { t } = useTranslation();
  const screenLang = useLang();
  // Bascule FR/EN des articles de l'addition (ex. bon pris en anglais, caissier francophone)
  const [itemsLang, setItemsLang] = useState<Lang>(screenLang);
  useEffect(() => setItemsLang(screenLang), [screenLang, target]);
  const lastClosed = useRef(false);

  const loadOverview = useCallback(() => {
    api<CheckoutOverview>("/checkout/overview")
      .then(setOverview)
      .catch((e) => toast.error(e.message));
  }, []);

  const loadBill = useCallback(async (t: CheckoutTarget | null) => {
    if (!t) return setBill(null);
    try {
      const b = await api<Bill>(t.kind === "table" ? `/checkout/table/${t.id}` : `/checkout/order/${t.id}`);
      setBill(b);
      // Les quantités sélectionnées ne peuvent pas dépasser ce qui reste à payer
      const left = new Map(b.orders.flatMap((o) => o.items).map((i) => [i.id, i.quantity - i.paidQuantity]));
      setSelection((sel) =>
        Object.fromEntries(
          Object.entries(sel)
            .map(([id, q]) => [id, Math.min(q, left.get(id) ?? 0)] as const)
            .filter(([, q]) => q > 0),
        ),
      );
    } catch (e) {
      toast.error((e as Error).message);
      setBill(null);
    }
  }, []);

  useEffect(loadOverview, [loadOverview]);

  // Changement d'addition : on repart d'une saisie vierge
  useEffect(() => {
    setSplit("FULL");
    setSelection({});
    setPanelKey((k) => k + 1);
    setLoadingBill(true);
    void loadBill(target).finally(() => setLoadingBill(false));
  }, [target, loadBill]);

  // Temps réel : nouveaux bons, statuts, versements d'une autre caisse, tables libérées
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadOverview();
        void loadBill(targetRef.current);
      }, 150);
    };
    const socket = getSocket();
    const events = ["new_order", "order_updated", "table_updated", "payment_recorded", "bill_updated", "request_bill", "table_alert_cleared", "connect"] as const;
    events.forEach((e) => socket.on(e, refresh));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => socket.off(e, refresh));
    };
  }, [loadOverview, loadBill]);

  async function pay(req: Omit<PayRequest, "tableId" | "orderId">) {
    if (!target) return;
    setSubmitting(true);
    try {
      const res = await api<PayResponse>("/checkout/pay", {
        method: "POST",
        body: JSON.stringify({ ...req, ...(target.kind === "table" ? { tableId: target.id } : { orderId: target.id }) }),
      });
      lastClosed.current = res.closed;
      setReceipt({ id: res.paymentId, auto: autoPrint });
      setSelection({});
      setPanelKey((k) => k + 1);
      if (res.closed) {
        setSplit("FULL");
        toast.success(res.tableReleased ? t("cashier.settledReleased") : t("cashier.billSettled"));
      }
      loadOverview();
      await loadBill(target);
    } catch (e) {
      toast.error((e as Error).message);
      void loadBill(target);
    } finally {
      setSubmitting(false);
    }
  }

  function closeReceipt() {
    setReceipt(null);
    if (lastClosed.current) {
      lastClosed.current = false;
      setTarget(null);
    }
  }

  function toggleAutoPrint() {
    setAutoPrint((v) => {
      try {
        localStorage.setItem("cashier-autoprint", v ? "0" : "1");
      } catch {
        /* préférence non mémorisée */
      }
      return !v;
    });
  }

  const title =
    bill?.target.kind === "table"
      ? t("common.table", { number: bill.target.table.number })
      : bill?.target.kind === "order"
        ? `${t("common.ticket", { number: bill.target.order.number })} · ${bill.target.order.type === "DELIVERY" ? t("common.delivery") : t("common.takeaway")}`
        : null;
  const hasEnglishOrders = bill?.orders.some((o) => o.language === "EN") ?? false;

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={t("nav.cashier")}>
        <button
          onClick={toggleAutoPrint}
          className={`hidden min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium lg:flex ${
            autoPrint ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
          title={t("cashier.autoPrintHint")}
          aria-pressed={autoPrint}
        >
          <Printer size={15} /> {autoPrint ? t("cashier.autoPrintOn") : t("cashier.autoPrintOff")}
        </button>
      </AppHeader>

      <div className="flex min-h-0 flex-1">
        {/* Plan de salle */}
        <aside className={`w-full shrink-0 border-r border-slate-200 bg-white lg:block lg:w-80 ${target ? "hidden" : "block"}`}>
          {overview ? (
            <FloorPlan overview={overview} filter={filter} onFilter={setFilter} selected={target} onSelect={setTarget} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          )}
        </aside>

        {/* Addition + encaissement */}
        <main className={`min-w-0 flex-1 ${target ? "flex" : "hidden lg:flex"} flex-col md:flex-row`}>
          {!target ? (
            <EmptyState />
          ) : !bill ? (
            <div className="flex flex-1 items-center justify-center">{loadingBill && <Loader2 className="animate-spin text-slate-400" />}</div>
          ) : (
            <>
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="border-b border-slate-200 bg-white px-4 py-3">
                  <div className="mb-3 flex items-center gap-2">
                    <button onClick={() => setTarget(null)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-100 lg:hidden" aria-label={t("common.back")}>
                      <ArrowLeft size={18} />
                    </button>
                    <h2 className="flex items-center gap-2 text-xl font-bold">
                      {bill.target.kind === "order" && <ShoppingBag size={20} />}
                      {title}
                    </h2>
                    <span className="text-sm text-slate-500">· {t("floor.openTickets", { count: bill.orders.length })}</span>
                    {hasEnglishOrders && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-700" title={t("kds.takenInEnglish")}>
                        EN
                      </span>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => setItemsLang(itemsLang === "fr" ? "en" : "fr")}
                      aria-pressed={itemsLang !== screenLang}
                      className="flex min-h-11 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                      title={t("cashier.itemsLanguageHint")}
                    >
                      <Languages size={16} />
                      <span className="hidden sm:inline">{t(itemsLang === "fr" ? "kds.viewInEn" : "kds.viewInFr")}</span>
                      <span className="sm:hidden">{itemsLang === "fr" ? "EN" : "FR"}</span>
                    </button>
                    {bill.totals.remaining > 0 && (
                      <button
                        onClick={() => setDiscountOpen(true)}
                        className="flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-50 px-3 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <BadgePercent size={16} /> {t("cashier.discount")}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label={t("cashier.billTotal")} value={bill.totals.total} />
                    <Stat
                      label={bill.totals.discounted ? t("cashier.paidWithDiscount", { discount: formatPrice(bill.totals.discounted) }) : t("cashier.alreadyPaid")}
                      value={bill.totals.paid}
                      tone="paid"
                    />
                    <Stat label={t("cashier.remaining")} value={bill.totals.remaining} tone="due" />
                  </div>
                  {bill.inKitchen > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                      <ChefHat size={15} />
                      {bill.target.kind === "table"
                        ? t("cashier.inKitchenTable", { count: bill.inKitchen })
                        : t("cashier.inKitchenTakeaway")}
                    </p>
                  )}
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                  {bill.orders.length === 0 ? (
                    <p className="py-16 text-center text-slate-400">{t("cashier.noOpenOrders")}</p>
                  ) : (
                    <BillItems
                      bill={bill}
                      selectable={split === "ITEMS"}
                      selection={selection}
                      onSelectionChange={setSelection}
                      itemsLang={itemsLang}
                    />
                  )}
                  <PaymentHistory payments={bill.payments} discounts={bill.discounts} onReprint={(id) => setReceipt({ id, auto: false })} />
                </div>
              </section>

              {bill.totals.remaining > 0 && (
                <aside className="flex min-h-0 w-full shrink-0 flex-col border-l border-slate-200 bg-white md:w-[380px] xl:w-[420px]">
                  <PaymentPanel
                    key={panelKey}
                    bill={bill}
                    split={split}
                    onSplitChange={(s) => {
                      setSplit(s);
                      if (s !== "ITEMS") setSelection({});
                    }}
                    selection={selection}
                    submitting={submitting}
                    onSubmit={pay}
                  />
                </aside>
              )}
            </>
          )}
        </main>
      </div>

      {bill && (
        <DiscountModal
          bill={bill}
          open={discountOpen}
          onClose={() => setDiscountOpen(false)}
          onApplied={(closed) => {
            setDiscountOpen(false);
            setPanelKey((k) => k + 1);
            loadOverview();
            if (closed) {
              toast.success(t("cashier.billSettled"));
              setTarget(null);
            } else void loadBill(target);
          }}
        />
      )}
      <ReceiptModal paymentId={receipt?.id ?? null} autoPrint={receipt?.auto} onClose={closeReceipt} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "paid" | "due" }) {
  const cls = tone === "due" ? "bg-brand-500 text-white" : tone === "paid" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100";
  return (
    <div className={`rounded-xl px-3 py-2 ${cls}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
      <div className="text-lg font-bold tabular-nums sm:text-xl">{formatPrice(value)}</div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <ReceiptIcon size={48} strokeWidth={1.5} />
      <p>{t("cashier.selectTarget")}</p>
    </div>
  );
}
