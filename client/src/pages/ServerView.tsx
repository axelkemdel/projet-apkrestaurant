import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, ShoppingCart, X } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { toast } from "../components/Toasts";
import { TableSelector } from "../components/server/TableSelector";
import { MenuBrowser } from "../components/server/MenuBrowser";
import { CustomizeModal } from "../components/server/CustomizeModal";
import { CartPanel } from "../components/server/CartPanel";
import { api } from "../lib/api";
import { emitWithAck, getSocket } from "../lib/socket";
import { formatPrice } from "../lib/format";
import { cartTotal, toOrderLines, useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import type { Category, MenuItem, Order } from "../types";

export function ServerView() {
  const user = useAuth((s) => s.user);
  const { table, orderType, lines, selectTable, selectTakeaway, resetTarget, add, clear } = useCart();
  const hasTarget = table !== null || orderType !== "DINE_IN";

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [customizing, setCustomizing] = useState<MenuItem | null>(null);
  const [sentOrders, setSentOrders] = useState<Order[]>([]);
  const [sending, setSending] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Carte : rechargée à chaque (re)connexion pour refléter les ruptures de stock
  useEffect(() => {
    const load = () => api<Category[]>("/menu").then(setCategories).catch((e) => toast.error(e.message));
    void load();
    const socket = getSocket();
    // Rupture de stock / modification de la carte par le gérant : mise à jour instantanée
    const onMenu = (event: { action: string; item?: { id: string; name: string; isAvailable: boolean } }) => {
      void load();
      if (event.action !== "availability" || !event.item) return;
      const { id, name, isAvailable } = event.item;
      if (isAvailable) return toast.info(`${name} est de nouveau disponible`);
      const inCart = useCart.getState().lines.some((l) => l.item.id === id);
      if (inCart) toast.error(`${name} est épuisé : retirez-le du panier`);
      else toast.info(`${name} est épuisé`);
    };
    socket.on("connect", load);
    socket.on("menu_updated", onMenu);
    return () => {
      socket.off("connect", load);
      socket.off("menu_updated", onMenu);
    };
  }, []);

  const loadTableOrders = useCallback(() => {
    if (!table) return setSentOrders([]);
    api<Order[]>(`/tables/${table.id}/orders`)
      .then(setSentOrders)
      .catch((e) => toast.error(e.message));
  }, [table]);

  useEffect(loadTableOrders, [loadTableOrders]);

  // Suivi en direct : statut des bons de la table + alerte quand une de MES commandes est prête
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (order: Order) => {
      if (order.status === "READY" && order.server.id === user?.id) {
        toast.info(`${order.table ? `Table ${order.table.number}` : "À emporter"} — bon #${order.number} prêt à servir`);
      }
      if (table && order.table?.id === table.id) loadTableOrders();
    };
    const onNew = (order: Order) => {
      if (table && order.table?.id === table.id) loadTableOrders();
    };
    socket.on("order_updated", onUpdate);
    socket.on("new_order", onNew);
    return () => {
      socket.off("order_updated", onUpdate);
      socket.off("new_order", onNew);
    };
  }, [table, user?.id, loadTableOrders]);

  async function sendOrder() {
    if (lines.length === 0) return;
    setSending(true);
    try {
      const order = await emitWithAck("new_order", {
        type: orderType,
        tableId: table?.id,
        items: toOrderLines(lines),
      });
      toast.success(`Bon #${order.number} envoyé en cuisine`);
      clear();
      setCartOpen(false);
      loadTableOrders();
    } catch (e) {
      const message = (e as Error).message;
      toast.error(message.includes("timed out") ? "Pas de réponse du serveur, vérifiez la connexion" : message);
    } finally {
      setSending(false);
    }
  }

  async function markServed(order: Order) {
    try {
      await emitWithAck("order_status", { orderId: order.id, status: "SERVED" });
      loadTableOrders();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function back() {
    if (lines.length > 0 && !confirm("Abandonner la commande en cours ?")) return;
    resetTarget();
    setSentOrders([]);
  }

  const targetLabel = table ? `Table ${table.number}` : orderType === "TAKEAWAY" ? "À emporter" : "Choisir une table";
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={hasTarget ? targetLabel : "Prise de commande"}>
        {hasTarget && (
          <button onClick={back} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
            <ArrowLeft size={16} /> Tables
          </button>
        )}
      </AppHeader>

      {!hasTarget ? (
        <TableSelector onSelect={selectTable} onTakeaway={selectTakeaway} />
      ) : !categories ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <MenuBrowser
            categories={categories}
            onCustomize={setCustomizing}
            onQuickAdd={(item) => {
              add({ item, quantity: 1, extras: [] });
            }}
          />

          {/* Panier : colonne fixe sur tablette paysage / desktop */}
          <aside className="hidden w-96 shrink-0 border-l border-slate-200 lg:block">
            <CartPanel sentOrders={sentOrders} sending={sending} onSend={sendOrder} onMarkServed={markServed} />
          </aside>

          {/* Panier : barre flottante + tiroir sur mobile */}
          <div className="fixed inset-x-0 bottom-0 z-30 p-3 lg:hidden">
            <button
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white shadow-xl"
            >
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingCart size={20} /> Panier
                {count > 0 && <span className="rounded-full bg-brand-500 px-2 text-sm">{count}</span>}
              </span>
              <span className="font-bold">{formatPrice(cartTotal(lines))}</span>
            </button>
          </div>
          <AnimatePresence>
            {cartOpen && (
              <motion.div
                className="fixed inset-0 z-40 flex flex-col bg-slate-950/50 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCartOpen(false)}
              >
                <motion.div
                  className="mt-auto flex h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="font-semibold">{targetLabel}</span>
                    <button onClick={() => setCartOpen(false)} aria-label="Fermer le panier">
                      <X />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <CartPanel sentOrders={sentOrders} sending={sending} onSend={sendOrder} onMarkServed={markServed} />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <CustomizeModal
        item={customizing}
        onClose={() => setCustomizing(null)}
        onConfirm={(line) => {
          add(line);
          setCustomizing(null);
        }}
      />
    </div>
  );
}
