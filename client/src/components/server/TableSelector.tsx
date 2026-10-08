import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShoppingBag, Users } from "lucide-react";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import type { Table, TableStatus } from "../../types";

const statusStyle: Record<TableStatus, { label: string; card: string; dot: string }> = {
  FREE: { label: "Libre", card: "border-emerald-200 bg-white hover:border-emerald-400", dot: "bg-emerald-500" },
  OCCUPIED: { label: "Occupée", card: "border-brand-300 bg-brand-50 hover:border-brand-500", dot: "bg-brand-500" },
  RESERVED: { label: "Réservée", card: "border-sky-200 bg-sky-50 hover:border-sky-400", dot: "bg-sky-500" },
};

export function TableSelector({ onSelect, onTakeaway }: { onSelect: (t: Table) => void; onTakeaway: () => void }) {
  const [tables, setTables] = useState<Table[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<string>("Toutes");

  useEffect(() => {
    const load = () =>
      api<Table[]>("/tables")
        .then(setTables)
        .catch((e) => setError(e.message));
    void load();
    // Le nombre de bons ouverts change aussi : on recharge à chaque mise à jour d'une table / nouveau bon
    const socket = getSocket();
    socket.on("table_updated", load);
    socket.on("new_order", load);
    socket.on("connect", load);
    return () => {
      socket.off("table_updated", load);
      socket.off("new_order", load);
      socket.off("connect", load);
    };
  }, []);

  const zones = useMemo(() => ["Toutes", ...new Set(tables?.map((t) => t.zone))], [tables]);
  const visible = tables?.filter((t) => zone === "Toutes" || t.zone === zone) ?? [];

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!tables)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {zones.map((z) => (
          <button
            key={z}
            onClick={() => setZone(z)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              zone === z ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-200"
            }`}
          >
            {z}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex gap-3 text-xs text-slate-500">
          {Object.entries(statusStyle).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onTakeaway}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-500"
        >
          <ShoppingBag />
          <span className="text-sm font-semibold">À emporter</span>
        </motion.button>

        {visible.map((t) => {
          const s = statusStyle[t.status];
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(t)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 transition-colors ${s.card}`}
            >
              <span className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${s.dot}`} />
              <span className="text-3xl font-bold">{t.number}</span>
              <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Users size={12} /> {t.capacity}
              </span>
              {t.openOrders > 0 && (
                <span className="mt-1 text-[11px] font-medium text-brand-700">
                  {t.openOrders} bon{t.openOrders > 1 ? "s" : ""}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
