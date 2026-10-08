import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChefHat, Loader2, Printer, ReceiptText as ReceiptIcon, ShoppingBag } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { toast } from "../components/Toasts";
import { FloorPlan, type CheckoutTarget, type FloorFilter } from "../components/cashier/FloorPlan";
import { BillItems, PaymentHistory, type ItemSelection } from "../components/cashier/BillItems";
import { PaymentPanel, type SplitMode } from "../components/cashier/PaymentPanel";
import { ReceiptModal } from "../components/cashier/ReceiptModal";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
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
    const events = ["new_order", "order_updated", "table_updated", "payment_recorded", "connect"] as const;
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
        toast.success(res.tableReleased ? "Addition soldée — table libérée" : "Addition soldée");
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
      ? `Table ${bill.target.table.number}`
      : bill?.target.kind === "order"
        ? `Bon #${bill.target.order.number} · ${bill.target.order.type === "DELIVERY" ? "Livraison" : "À emporter"}`
        : null;

  return (
    <div className="flex h-full flex-col">
      <AppHeader title="Caisse">
        <button
          onClick={toggleAutoPrint}
          className={`hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium sm:flex ${
            autoPrint ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
          }`}
          title="Ouvrir l'impression du ticket automatiquement après chaque encaissement"
        >
          <Printer size={15} /> Impression auto {autoPrint ? "activée" : "désactivée"}
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
                    <button onClick={() => setTarget(null)} className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" aria-label="Retour">
                      <ArrowLeft size={18} />
                    </button>
                    <h2 className="flex items-center gap-2 text-xl font-bold">
                      {bill.target.kind === "order" && <ShoppingBag size={20} />}
                      {title}
                    </h2>
                    <span className="text-sm text-slate-500">
                      · {bill.orders.length} bon{bill.orders.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Total addition" value={bill.totals.total} />
                    <Stat label="Déjà payé" value={bill.totals.paid} tone="paid" />
                    <Stat label="Reste à payer" value={bill.totals.remaining} tone="due" />
                  </div>
                  {bill.inKitchen > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                      <ChefHat size={15} />
                      {bill.target.kind === "table"
                        ? `${bill.inKitchen} bon${bill.inKitchen > 1 ? "s" : ""} encore en cuisine : la table sera libérée une fois servi${bill.inKitchen > 1 ? "s" : ""}.`
                        : "Commande encore en préparation : elle reste affichée en cuisine jusqu'à sa remise au client."}
                    </p>
                  )}
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                  {bill.orders.length === 0 ? (
                    <p className="py-16 text-center text-slate-400">Aucune commande ouverte sur cette table</p>
                  ) : (
                    <BillItems
                      bill={bill}
                      selectable={split === "ITEMS"}
                      selection={selection}
                      onSelectionChange={setSelection}
                    />
                  )}
                  <PaymentHistory payments={bill.payments} onReprint={(id) => setReceipt({ id, auto: false })} />
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <ReceiptIcon size={48} strokeWidth={1.5} />
      <p>Sélectionnez une table ou un bon à emporter</p>
    </div>
  );
}
