import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, ChefHat, Martini, Volume2, VolumeX } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { toast } from "../components/Toasts";
import { TicketCard } from "../components/kitchen/TicketCard";
import { api } from "../lib/api";
import { emitWithAck, getSocket } from "../lib/socket";
import { playNewOrderChime, unlockAudio } from "../lib/sound";
import { useNow } from "../lib/useNow";
import type { Order, OrderStatus, Station } from "../types";

type StationFilter = Station | "ALL";

const COLUMNS: { status: OrderStatus; title: string; accent: string }[] = [
  { status: "PENDING", title: "À préparer", accent: "text-slate-200" },
  { status: "PREPARING", title: "En cours", accent: "text-amber-400" },
  { status: "READY", title: "Prêtes", accent: "text-emerald-400" },
];

const ACTIVE: OrderStatus[] = ["PENDING", "PREPARING", "READY"];

function readStation(): StationFilter {
  try {
    const v = localStorage.getItem("kds-station");
    return v === "KITCHEN" || v === "BAR" ? v : "ALL";
  } catch {
    return "ALL";
  }
}

export function KitchenView() {
  const now = useNow(1000);
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<StationFilter>(readStation);
  const [soundOn, setSoundOn] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Order | null>(null);

  const load = useCallback(() => {
    api<Order[]>("/orders/active")
      .then(setOrders)
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();

    const onNew = (order: Order) => {
      setOrders((cur) => (cur.some((o) => o.id === order.id) ? cur : [...cur, order]));
      setFresh((s) => new Set(s).add(order.id));
      setTimeout(
        () =>
          setFresh((s) => {
            const next = new Set(s);
            next.delete(order.id);
            return next;
          }),
        6000,
      );
      setFlash(order);
      setTimeout(() => setFlash((f) => (f?.id === order.id ? null : f)), 2200);
      playNewOrderChime();
    };

    const onUpdate = (order: Order) => {
      setOrders((cur) =>
        ACTIVE.includes(order.status)
          ? cur.some((o) => o.id === order.id)
            ? cur.map((o) => (o.id === order.id ? order : o))
            : [...cur, order]
          : cur.filter((o) => o.id !== order.id),
      );
    };

    socket.on("new_order", onNew);
    socket.on("order_updated", onUpdate);
    // Après une coupure réseau, on resynchronise l'état complet
    socket.on("connect", load);
    return () => {
      socket.off("new_order", onNew);
      socket.off("order_updated", onUpdate);
      socket.off("connect", load);
    };
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem("kds-station", station);
    } catch {
      /* stockage indisponible : on garde le filtre en mémoire */
    }
  }, [station]);

  const visible = useMemo(
    () => orders.filter((o) => station === "ALL" || o.items.some((i) => i.station === station)),
    [orders, station],
  );

  async function advance(order: Order, status: OrderStatus) {
    setBusy((s) => new Set(s).add(order.id));
    try {
      const updated = await emitWithAck("order_status", { orderId: order.id, status });
      setOrders((cur) =>
        ACTIVE.includes(updated.status) ? cur.map((o) => (o.id === updated.id ? updated : o)) : cur.filter((o) => o.id !== updated.id),
      );
    } catch (e) {
      toast.error((e as Error).message);
      load();
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(order.id);
        return next;
      });
    }
  }

  async function toggleSound() {
    if (soundOn) return setSoundOn(false);
    const ok = await unlockAudio();
    setSoundOn(ok);
    if (ok) playNewOrderChime();
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <AppHeader title="Cuisine & Bar" dark>
        <div className="flex rounded-lg bg-slate-800 p-0.5 text-sm">
          {(
            [
              ["ALL", "Tout", null],
              ["KITCHEN", "Cuisine", ChefHat],
              ["BAR", "Bar", Martini],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setStation(value)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${
                station === value ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-white"
              }`}
            >
              {Icon && <Icon size={14} />}
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleSound}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            soundOn ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300 animate-pulse"
          }`}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span className="hidden sm:inline">{soundOn ? "Son activé" : "Activer le son"}</span>
        </button>
      </AppHeader>

      <div className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto p-3">
        {COLUMNS.map((col) => {
          const list = visible.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="flex min-w-[300px] flex-1 snap-start flex-col rounded-2xl bg-slate-900/60">
              <h2 className={`flex items-center justify-between px-4 py-3 text-sm font-bold uppercase tracking-wider ${col.accent}`}>
                {col.title}
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-300">{list.length}</span>
              </h2>
              <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto px-3 pb-3 2xl:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {list.map((o) => (
                    <TicketCard
                      key={o.id}
                      order={o}
                      now={now}
                      station={station}
                      busy={busy.has(o.id)}
                      isNew={fresh.has(o.id)}
                      onAction={advance}
                    />
                  ))}
                </AnimatePresence>
                {list.length === 0 && <p className="py-10 text-center text-sm text-slate-600">Aucun bon</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Signal visuel à la réception d'un nouveau bon */}
      <AnimatePresence>
        {flash && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-brand-500/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-3 rounded-2xl bg-brand-500 px-8 py-5 text-2xl font-black text-white shadow-2xl"
            >
              <BellRing className="animate-bounce" />
              Nouveau bon · {flash.table ? `Table ${flash.table.number}` : "À emporter"}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
