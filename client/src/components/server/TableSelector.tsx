import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BellRing, Check, Loader2, ReceiptText, ShoppingBag, Users } from "lucide-react";
import { toast } from "../Toasts";
import { formatTime } from "../../lib/format";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import type { Table, TableStatus } from "../../types";
import { useTranslation } from "react-i18next";
import { zoneName } from "../../lib/localize";

const statusStyle: Record<TableStatus, { card: string; dot: string }> = {
  FREE: { card: "border-emerald-200 bg-white hover:border-emerald-400", dot: "bg-emerald-500" },
  OCCUPIED: { card: "border-brand-300 bg-brand-50 hover:border-brand-500", dot: "bg-brand-500" },
  RESERVED: { card: "border-sky-200 bg-sky-50 hover:border-sky-400", dot: "bg-sky-500" },
};

const ALL_ZONES = "*";

export function TableSelector({ onSelect, onTakeaway }: { onSelect: (t: Table) => void; onTakeaway: () => void }) {
  const [tables, setTables] = useState<Table[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const [zone, setZone] = useState<string>(ALL_ZONES);

  useEffect(() => {
    const load = () =>
      api<Table[]>("/tables")
        .then(setTables)
        .catch((e) => setError(e.message));
    void load();
    // Le nombre de bons ouverts change aussi : on recharge à chaque mise à jour d'une table / nouveau bon
    const socket = getSocket();
    // Demandes des clients (QR) : alerte visible sur la table jusqu'à sa prise en compte
    const events = ["table_updated", "new_order", "connect", "server_alert", "request_bill", "table_alert_cleared"] as const;
    events.forEach((e) => socket.on(e, load));
    return () => events.forEach((e) => socket.off(e, load));
  }, []);

  async function acknowledge(tb: Table, kind: "CALL" | "BILL") {
    try {
      await api(`/tables/${tb.id}/requests/clear`, { method: "POST", body: JSON.stringify({ kind }) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const requests = (tables ?? []).flatMap((tb) => [
    ...(tb.callRequestedAt ? [{ tb, kind: "CALL" as const, at: tb.callRequestedAt }] : []),
    ...(tb.billRequestedAt ? [{ tb, kind: "BILL" as const, at: tb.billRequestedAt }] : []),
  ]).sort((a, b) => a.at.localeCompare(b.at));

  const zones = useMemo(() => [ALL_ZONES, ...new Set(tables?.map((tb) => tb.zone))], [tables]);
  const visible = tables?.filter((tb) => zone === ALL_ZONES || tb.zone === zone) ?? [];

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
            {z === ALL_ZONES ? t("floor.allZones") : zoneName(z, t)}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex gap-3 text-xs text-slate-500">
          {Object.entries(statusStyle).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {t(`tableStatus.${k as TableStatus}`)}
            </span>
          ))}
        </div>
      </div>

      {requests.length > 0 && (
        <section className="mb-4 rounded-2xl bg-white p-3 shadow-sm ring-2 ring-red-200" aria-live="polite">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
            <BellRing size={16} className="animate-pulse" /> {t("alerts.requestsTitle")}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {requests.map(({ tb, kind, at }) => (
              <li key={`${tb.id}-${kind}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${kind === "CALL" ? "bg-red-50" : "bg-violet-50"}`}>
                {kind === "CALL" ? <BellRing size={18} className="text-red-600" /> : <ReceiptText size={18} className="text-violet-600" />}
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {t(kind === "CALL" ? "alerts.call" : "alerts.bill", { number: tb.number })}
                  <span className="block text-xs font-normal text-slate-500">{formatTime(at)}</span>
                </span>
                <button
                  onClick={() => void acknowledge(tb, kind)}
                  className="flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  <Check size={16} /> {t("alerts.ack")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onTakeaway}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-600 hover:border-slate-500"
        >
          <ShoppingBag />
          <span className="text-sm font-semibold">{t("common.takeaway")}</span>
        </motion.button>

        {visible.map((tb) => {
          const s = statusStyle[tb.status];
          return (
            <motion.button
              key={tb.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(tb)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 transition-colors ${s.card}`}
            >
              <span className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${s.dot}`} />
              {(tb.callRequestedAt || tb.billRequestedAt) && (
                <span className="absolute left-2 top-2 flex gap-1">
                  {tb.callRequestedAt && (
                    <span className="flex h-6 w-6 animate-pulse items-center justify-center rounded-full bg-red-600 text-white" aria-label={t("alerts.callBadge")}>
                      <BellRing size={13} />
                    </span>
                  )}
                  {tb.billRequestedAt && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white" aria-label={t("alerts.billBadge")}>
                      <ReceiptText size={13} />
                    </span>
                  )}
                </span>
              )}
              <span className="text-3xl font-bold">{tb.number}</span>
              <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Users size={12} /> {tb.capacity}
              </span>
              {tb.openOrders > 0 && (
                <span className="mt-1 text-[11px] font-medium text-brand-700">
                  {t("floor.openTickets", { count: tb.openOrders })}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
