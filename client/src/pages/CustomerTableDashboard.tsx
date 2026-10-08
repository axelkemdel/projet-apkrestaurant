import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, BookOpen, Loader2, PartyPopper, QrCode, ReceiptText, RefreshCw, ShoppingBasket, Star, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { currentLang } from "../i18n";
import { api, ApiError } from "../lib/api";
import { connectPublicSocket } from "../lib/publicSocket";
import { formatNumber, formatTime } from "../lib/format";
import { itemName, toOrderLanguage } from "../lib/localize";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { CustomizeModal } from "../components/server/CustomizeModal";
import { GuestMenu } from "../components/customer/GuestMenu";
import { GuestCartSheet } from "../components/customer/GuestCartSheet";
import { OrderTracker } from "../components/customer/OrderTracker";
import { ReviewModal } from "../components/customer/ReviewModal";
import { toast } from "../components/Toasts";
import { cartTotal, toOrderLines } from "../store/cart";
import { useGuestCart } from "../store/guestCart";
import type { MenuItem, Portal, PublicOrder, PublicTable } from "../types";

type Tab = "menu" | "tracking";
type Failure = "invalid" | "expired" | "network";

const HEADER_HEIGHT = 132;

// Mémoire locale, sans compte client : dernier bon de la session, avis déjà donnés
const storage = {
  get(store: Storage, key: string) {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  },
  set(store: Storage, key: string, value: string) {
    try {
      store.setItem(key, value);
    } catch {
      /* stockage indisponible (navigation privée) : sans conséquence */
    }
  },
};
const reviewedKey = (orderId: string) => `restoapp-reviewed:${orderId}`;

/**
 * Portail client d'une table (QR code /qr/:token), mobile d'abord.
 *  - Carte bilingue avec photos, recherche, personnalisation et panier ;
 *  - suivi en direct de tous les bons de la table (y compris ceux pris par le serveur) ;
 *  - appel du serveur, demande d'addition, avis en fin de repas.
 * Pas de compte : le jeton secret du QR code identifie la table, plusieurs téléphones
 * de la même table partagent la même session de commande.
 */
export function CustomerTableDashboard() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [table, setTable] = useState<PublicTable | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [connected, setConnected] = useState(true);
  const [tab, setTab] = useState<Tab>("menu");
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<"CALL" | "BILL" | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [lastOrderId, setLastOrderId] = useState<string | null>(() => storage.get(sessionStorage, `restoapp-last-order:${token}`));

  const cart = useGuestCart();
  const { bind, add, clear } = cart;
  const lastStatuses = useRef(new Map<string, string>());

  const currency = portal?.restaurant.currency ?? "FCFA";
  const money = useCallback((n: number) => `${formatNumber(n)} ${currency}`, [currency]);

  useEffect(() => bind(token), [bind, token]);

  const rememberLastOrder = useCallback(
    (list: PublicOrder[]) => {
      const last = list.at(-1);
      if (!last) return;
      setLastOrderId(last.id);
      storage.set(sessionStorage, `restoapp-last-order:${token}`, last.id);
    },
    [token],
  );

  /** (Re)charge la table, la carte et les bons en cours ; recale le panier sur la carte. */
  const refresh = useCallback(async () => {
    try {
      const data = await api<Portal>(`/public/table/${encodeURIComponent(token)}`);
      setPortal(data);
      setTable(data.table);
      setOrders(data.orders);
      data.orders.forEach((o) => lastStatuses.current.set(o.id, o.status));
      rememberLastOrder(data.orders);
      setReviewed((cur) => new Set([...cur, ...data.reviewedOrderIds]));
      setFailure(null);
      for (const line of useGuestCart.getState().sync(data.menu)) {
        toast.error(i18n.t("portal.itemRemoved", { name: itemName(line.item, currentLang()) }));
      }
    } catch (e) {
      setFailure(e instanceof ApiError && e.status === 404 ? "invalid" : "network");
    }
  }, [token, rememberLastOrder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Temps réel : uniquement les événements de cette table
  useEffect(() => {
    const socket = connectPublicSocket(token);
    socket.on("connect", () => {
      setConnected(true);
      void refresh(); // rattrape ce qui a pu être manqué pendant une coupure
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      // Déconnexion décidée par le serveur : QR code régénéré par le gérant
      if (reason === "io server disconnect") setFailure("expired");
    });
    socket.on("connect_error", (err) => {
      setConnected(false);
      if (err.message === "invalid_qr") {
        setFailure((f) => f ?? "expired");
        socket.disconnect();
      }
    });
    socket.on("order_status_changed", (order) => {
      const previous = lastStatuses.current.get(order.id);
      lastStatuses.current.set(order.id, order.status);
      if (order.status === "READY" && previous !== "READY") {
        toast.success(`${i18n.t("portal.orderNumber", { number: order.number })} — ${i18n.t("portal.stepsHint.READY")}`);
        navigator.vibrate?.([120, 60, 120]);
      }
      setOrders((list) => {
        // Bon soldé ou annulé : il quitte la session de la table
        if (order.status === "PAID" || order.status === "CANCELLED") return list.filter((o) => o.id !== order.id);
        const exists = list.some((o) => o.id === order.id);
        const next = exists ? list.map((o) => (o.id === order.id ? order : o)) : [...list, order];
        if (!exists) rememberLastOrder(next);
        return next;
      });
    });
    socket.on("table_updated", (patch) => setTable((cur) => (cur ? { ...cur, ...patch } : cur)));
    socket.on("menu_updated", () => void refresh());
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, refresh, rememberLastOrder]);

  // Titre de l'onglet : « Le Maquis · Table 5 »
  useEffect(() => {
    if (portal && table) document.title = `${portal.restaurant.name} · ${t("portal.tableLabel", { number: table.number })}`;
  }, [portal, table, t]);

  // Avis déjà donnés depuis ce téléphone
  useEffect(() => {
    if (lastOrderId && storage.get(localStorage, reviewedKey(lastOrderId))) setReviewed((cur) => new Set([...cur, lastOrderId]));
  }, [lastOrderId]);

  const hadOrders = lastOrderId !== null;
  const closed = Boolean(table && table.status === "FREE" && orders.length === 0 && hadOrders);
  const allServed = orders.length > 0 && orders.every((o) => o.status === "SERVED");
  const canReview = Boolean(lastOrderId && !reviewed.has(lastOrderId));
  const tableTotal = orders.reduce((s, o) => s + o.totalAmount, 0);

  // Proposition d'avis, une seule fois par visite : repas servi, addition demandée ou table réglée
  useEffect(() => {
    if (!canReview || reviewOpen) return;
    const promptKey = `restoapp-review-prompted:${lastOrderId}`;
    if (storage.get(sessionStorage, promptKey)) return;
    if (!(closed || table?.billRequestedAt || allServed)) return;
    const timer = setTimeout(() => {
      storage.set(sessionStorage, promptKey, "1");
      setReviewOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [canReview, reviewOpen, closed, allServed, table?.billRequestedAt, lastOrderId]);

  async function sendOrder() {
    const { lines, note } = useGuestCart.getState();
    if (lines.length === 0) return;
    setSending(true);
    try {
      const order = await api<{ id: string; number: number }>("/public/orders", {
        method: "POST",
        body: JSON.stringify({
          token,
          language: toOrderLanguage(currentLang()),
          customerNote: note.trim() || undefined,
          items: toOrderLines(lines),
        }),
      });
      toast.success(t("portal.sent", { number: order.number }));
      clear();
      setCartOpen(false);
      setTab("tracking");
      window.scrollTo({ top: 0, behavior: "smooth" });
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
      void refresh(); // plat épuisé entre-temps : la carte et le panier sont recalés
    } finally {
      setSending(false);
    }
  }

  async function assistance(kind: "CALL" | "BILL") {
    if (kind === "BILL" && !confirm(t("portal.confirmBill"))) return;
    setBusy(kind);
    try {
      const res = await api<{ notified: boolean; requestedAt: string }>(
        `/public/table/${encodeURIComponent(token)}/${kind === "CALL" ? "call-server" : "request-bill"}`,
        { method: "POST" },
      );
      setTable((cur) => (cur ? { ...cur, [kind === "CALL" ? "callRequestedAt" : "billRequestedAt"]: res.requestedAt } : cur));
      if (!res.notified) toast.info(t("portal.alreadyCalled"));
      else toast.success(kind === "CALL" ? t("portal.callSent") : t("portal.billSent"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitReview(rating: number, comment: string) {
    try {
      await api("/public/reviews", {
        method: "POST",
        body: JSON.stringify({ token, orderId: lastOrderId ?? undefined, rating, comment: comment || undefined, language: toOrderLanguage(currentLang()) }),
      });
      toast.success(t("portal.review.thanks"));
    } catch (e) {
      // Déjà noté (autre téléphone de la table) : on considère l'avis comme donné
      if (!(e instanceof ApiError && e.status === 409)) {
        toast.error((e as Error).message);
        return;
      }
      toast.info((e as Error).message);
    }
    if (lastOrderId) {
      storage.set(localStorage, reviewedKey(lastOrderId), "1");
      setReviewed((cur) => new Set([...cur, lastOrderId]));
    }
    setReviewOpen(false);
  }

  const count = cart.lines.reduce((s, l) => s + l.quantity, 0);
  const activeOrders = useMemo(() => orders.filter((o) => o.status !== "SERVED").length, [orders]);

  if (failure === "invalid" || failure === "expired") return <FailureScreen kind={failure} />;
  if (!portal || !table) {
    return failure === "network" ? (
      <FailureScreen kind="network" onRetry={() => void refresh()} />
    ) : (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
        <Loader2 className="animate-spin text-brand-500" size={32} />
        {t("portal.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 pb-28 text-slate-900">
      {/* En-tête collant : table, langue, connexion, appel serveur / addition */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur" style={{ height: HEADER_HEIGHT }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md shadow-brand-500/30">
            <QrCode size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold uppercase tracking-wide text-brand-600">{portal.restaurant.name}</div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-tight">{t("portal.tableLabel", { number: table.number })}</h1>
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`}
                title={connected ? t("portal.live") : t("portal.offline")}
                aria-label={connected ? t("portal.live") : t("portal.offline")}
              />
            </div>
          </div>
          <LanguageSwitcher />
        </div>
        <div className="mx-auto mt-3 grid max-w-5xl grid-cols-2 gap-2 px-4">
          <AssistButton
            Icon={BellRing}
            label={t("portal.callServer")}
            short={t("portal.callServerShort")}
            pending={table.callRequestedAt ? t("portal.pendingCall", { time: formatTime(table.callRequestedAt) }) : null}
            busy={busy === "CALL"}
            onClick={() => void assistance("CALL")}
          />
          <AssistButton
            Icon={ReceiptText}
            label={t("portal.requestBill")}
            short={t("portal.requestBillShort")}
            pending={table.billRequestedAt ? t("portal.pendingBill", { time: formatTime(table.billRequestedAt) }) : null}
            busy={busy === "BILL"}
            disabled={orders.length === 0}
            onClick={() => void assistance("BILL")}
          />
        </div>
      </header>

      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden bg-amber-100 text-center text-sm font-medium text-amber-900"
          >
            <p className="flex items-center justify-center gap-2 py-2">
              <WifiOff size={16} /> {t("portal.offline")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-5xl px-4">
        {/* Onglets : carte / suivi (côte à côte sur grand écran) */}
        <div className="mt-4 grid grid-cols-2 rounded-2xl bg-slate-200/60 p-1 lg:hidden" role="tablist">
          {(
            [
              ["menu", t("portal.tabMenu"), BookOpen, 0],
              ["tracking", t("portal.tabTracking"), ShoppingBasket, activeOrders],
            ] as const
          ).map(([id, label, Icon, badge]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`relative flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${tab === id ? "text-slate-900" : "text-slate-500"}`}
            >
              {tab === id && <motion.span layoutId="guest-tab" className="absolute inset-0 rounded-xl bg-white shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span className="relative flex items-center gap-2">
                <Icon size={18} /> {label}
                {badge > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-xs text-white">{badge}</span>}
              </span>
            </button>
          ))}
        </div>

        {closed && <ClosedBanner canReview={canReview} onReview={() => setReviewOpen(true)} onMenu={() => setTab("menu")} />}

        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-6">
          <div className={tab === "menu" ? "block" : "hidden lg:block"}>
            {!portal.ordering && <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">{t("portal.orderingDisabled")}</p>}
            <GuestMenu
              categories={portal.menu}
              ordering={portal.ordering}
              money={money}
              stickyOffset={HEADER_HEIGHT}
              onOpen={(item) => portal.ordering && setCustomizing(item)}
              onQuickAdd={(item) => {
                add({ item, quantity: 1, extras: [], quickNotes: [] });
                toast.success(`+1 ${itemName(item, currentLang())}`);
              }}
            />
          </div>

          <aside className={`${tab === "tracking" ? "block" : "hidden lg:block"} lg:sticky lg:top-[148px] lg:self-start`}>
            <div className="mt-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                {t("portal.tabTracking")}
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {t("portal.live")}
                </span>
              </h2>
              {orders.length > 0 && (
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{t("portal.tableTotal")}</div>
                  <div className="font-bold tabular-nums">{money(tableTotal)}</div>
                </div>
              )}
            </div>
            <div className="mt-3">
              {orders.length === 0 ? (
                <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-slate-200/70">
                  <span className="text-4xl">🍽️</span>
                  <p className="mt-3 font-semibold text-slate-700">{t("portal.trackingEmpty")}</p>
                  <p className="mt-1 text-sm text-slate-500">{t("portal.trackingEmptyHint")}</p>
                </div>
              ) : (
                <OrderTracker orders={orders} money={money} />
              )}
            </div>
            {canReview && !closed && (allServed || table.billRequestedAt) && (
              <button
                onClick={() => setReviewOpen(true)}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-amber-700 shadow-sm ring-1 ring-amber-200"
              >
                <Star size={18} className="fill-amber-400 text-amber-400" /> {t("portal.review.cta")}
              </button>
            )}
          </aside>
        </div>
      </main>

      {/* Barre panier flottante */}
      <AnimatePresence>
        {portal.ordering && count > 0 && (
          <motion.div
            initial={{ y: 120 }}
            animate={{ y: 0 }}
            exit={{ y: 120 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
          >
            <motion.button
              key={count}
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              onClick={() => setCartOpen(true)}
              className="mx-auto flex min-h-14 w-full max-w-md items-center justify-between rounded-2xl bg-slate-900 px-5 text-white shadow-2xl"
            >
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingBasket size={20} /> {t("portal.viewCart")}
                <span className="rounded-full bg-brand-500 px-2 text-sm">{t("portal.items", { count })}</span>
              </span>
              <span className="font-bold tabular-nums">{money(cartTotal(cart.lines))}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <GuestCartSheet open={cartOpen} onClose={() => setCartOpen(false)} onSend={() => void sendOrder()} sending={sending} money={money} />

      <CustomizeModal
        item={customizing}
        money={money}
        maxQuantity={20}
        showImage
        onClose={() => setCustomizing(null)}
        onConfirm={(line) => {
          if (portal.ordering) add(line);
          setCustomizing(null);
        }}
      />

      <ReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} onSubmit={submitReview} />
    </div>
  );
}

function AssistButton({
  Icon,
  label,
  short,
  pending,
  busy,
  disabled,
  onClick,
}: {
  Icon: typeof BellRing;
  label: string;
  /** Libellé court sur petit écran (« Serveur », « Addition ») */
  short: string;
  pending: string | null;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={label}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold disabled:opacity-40 ${
        pending ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-slate-900 text-white"
      }`}
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      <span className="min-w-0 text-left leading-tight">
        <span className="block truncate">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>
        {pending && <span className="block truncate text-[11px] font-medium opacity-80">{pending}</span>}
      </span>
    </motion.button>
  );
}

function ClosedBanner({ canReview, onReview, onMenu }: { canReview: boolean; onReview: () => void; onMenu: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-emerald-600 p-5 text-white shadow-lg">
      <PartyPopper size={28} />
      <h2 className="mt-2 text-lg font-bold">{t("portal.sessionClosed")}</h2>
      <p className="text-sm text-emerald-50">{t("portal.sessionClosedText")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canReview && (
          <button onClick={onReview} className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-semibold text-emerald-700">
            <Star size={18} className="fill-amber-400 text-amber-400" /> {t("portal.review.cta")}
          </button>
        )}
        <button onClick={onMenu} className="min-h-12 rounded-xl bg-emerald-700 px-4 font-semibold lg:hidden">
          {t("portal.orderAgain")}
        </button>
      </div>
    </motion.div>
  );
}

function FailureScreen({ kind, onRetry }: { kind: Failure; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-400 shadow-sm">
        {kind === "network" ? <WifiOff size={30} /> : <QrCode size={30} />}
      </span>
      <h1 className="mt-4 text-xl font-bold">{kind === "network" ? t("portal.offline") : t("portal.invalidTitle")}</h1>
      <p className="mt-2 max-w-sm text-slate-500">{kind === "expired" ? t("portal.expired") : kind === "invalid" ? t("portal.invalidText") : ""}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-6 flex min-h-12 items-center gap-2 rounded-xl bg-slate-900 px-5 font-semibold text-white">
          <RefreshCw size={18} /> {t("portal.retry")}
        </button>
      )}
    </div>
  );
}
