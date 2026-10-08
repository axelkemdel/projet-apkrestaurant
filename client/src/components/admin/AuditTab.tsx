import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Ban, BadgePercent, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck, Tag, Trash2, UserCog, UserPlus, UtensilsCrossed } from "lucide-react";
import { api } from "../../lib/api";
import { formatDateTime, formatPrice, roleLabel } from "../../lib/format";
import { toast } from "../Toasts";
import type { AuditAction, AuditLogEntry, Role } from "../../types";

const ACTIONS: Record<AuditAction, { label: string; Icon: typeof Ban; tone: string }> = {
  ORDER_CANCELLED: { label: "Annulation de commande", Icon: Ban, tone: "bg-red-50 text-red-700" },
  DISCOUNT_APPLIED: { label: "Remise", Icon: BadgePercent, tone: "bg-amber-50 text-amber-800" },
  MENU_PRICE_CHANGED: { label: "Changement de prix", Icon: Tag, tone: "bg-amber-50 text-amber-800" },
  MENU_ITEM_CREATED: { label: "Plat créé", Icon: UtensilsCrossed, tone: "bg-slate-100 text-slate-700" },
  MENU_ITEM_DELETED: { label: "Plat supprimé", Icon: Trash2, tone: "bg-slate-100 text-slate-700" },
  PIN_RESET: { label: "Code PIN réinitialisé", Icon: KeyRound, tone: "bg-sky-50 text-sky-800" },
  USER_CREATED: { label: "Employé créé", Icon: UserPlus, tone: "bg-sky-50 text-sky-800" },
  USER_ROLE_CHANGED: { label: "Rôle modifié", Icon: UserCog, tone: "bg-sky-50 text-sky-800" },
  USER_STATUS_CHANGED: { label: "Compte (dés)activé", Icon: UserCog, tone: "bg-sky-50 text-sky-800" },
  LOGIN_LOCKED: { label: "Profil verrouillé (PIN)", Icon: Lock, tone: "bg-red-50 text-red-700" },
};

const n = (v: unknown) => Number(v ?? 0);
const t = (v: unknown) => String(v ?? "");

/** Résumé lisible du détail JSON enregistré par le serveur. */
function describe(e: AuditLogEntry): string {
  const d = e.details;
  const table = d.table ? ` · Table ${t(d.table)}` : "";
  switch (e.action) {
    case "ORDER_CANCELLED": {
      const items = (d.items as { name: string; quantity: number }[] | undefined) ?? [];
      return `Bon #${t(d.orderNumber)}${table} annulé (${formatPrice(n(d.amount))}) : ${items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}`;
    }
    case "DISCOUNT_APPLIED":
      return `${d.kind === "PERCENT" ? `${t(d.value)} %` : formatPrice(n(d.value))} = ${formatPrice(n(d.amount))} sur ${formatPrice(n(d.billTotal))}${table} — « ${t(d.reason)} » (cumul ${t(d.cumulatedPct)} %)`;
    case "MENU_PRICE_CHANGED": {
      const delta = n(d.newPrice) - n(d.oldPrice);
      return `${t(d.name)} : ${formatPrice(n(d.oldPrice))} → ${formatPrice(n(d.newPrice))} (${delta > 0 ? "+" : ""}${formatPrice(delta)})`;
    }
    case "MENU_ITEM_CREATED":
      return `${t(d.name)} à ${formatPrice(n(d.price))}`;
    case "MENU_ITEM_DELETED":
      return `${t(d.name)} (${formatPrice(n(d.price))})`;
    case "PIN_RESET":
      return `Code de ${t(d.name)} ${d.generated ? "généré automatiquement" : "saisi par le gérant"}`;
    case "USER_CREATED":
      return `${t(d.name)} — ${roleLabel[d.role as Role] ?? t(d.role)}`;
    case "USER_ROLE_CHANGED":
      return `${t(d.name)} : ${roleLabel[d.oldRole as Role] ?? t(d.oldRole)} → ${roleLabel[d.newRole as Role] ?? t(d.newRole)}`;
    case "USER_STATUS_CHANGED":
      return `${t(d.name)} ${d.isActive ? "réactivé" : "désactivé"}`;
    case "LOGIN_LOCKED":
      return `Profil de ${t(d.targetName)} bloqué 5 min après 5 codes PIN erronés`;
  }
}

export function AuditTab() {
  const [items, setItems] = useState<AuditLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<AuditAction | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useCallback(
    (after?: string) => {
      const p = new URLSearchParams({ limit: "30" });
      if (action) p.set("action", action);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (after) p.set("cursor", after);
      return api<{ items: AuditLogEntry[]; nextCursor: string | null }>(`/admin/audit-logs?${p}`);
    },
    [action, from, to],
  );

  const load = useCallback(() => {
    setItems(null);
    query()
      .then((r) => {
        setItems(r.items);
        setCursor(r.nextCursor);
      })
      .catch((e) => toast.error(e.message));
  }, [query]);

  useEffect(load, [load]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await query(cursor);
      setItems((cur) => [...(cur ?? []), ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-slate-500">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
        Journal anti-fraude en ajout seul : chaque action critique est enregistrée avec son auteur, l'heure et l'adresse IP de l'appareil.
        Il ne peut être ni modifié ni effacé, y compris par un gérant.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | "")}
          className="col-span-2 min-h-12 rounded-xl bg-white px-3 text-sm shadow-sm outline-none sm:w-64"
          aria-label="Filtrer par type d'action"
        >
          <option value="">Toutes les actions</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm shadow-sm">
          <span className="text-slate-400">Du</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm shadow-sm">
          <span className="text-slate-400">au</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <button onClick={load} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm sm:col-span-1">
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {!items ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400 shadow-sm">Aucune action enregistrée pour ces critères</p>
      ) : (
        <ol className="space-y-2">
          {items.map((e) => {
            const a = ACTIONS[e.action];
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm sm:items-center sm:p-4"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.tone}`}>
                  <a.Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-slate-900">{a.label}</span>
                    <time className="text-xs text-slate-500" dateTime={e.timestamp}>
                      {formatDateTime(e.timestamp)}
                    </time>
                  </div>
                  <p className="break-words text-sm text-slate-700">{describe(e)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Par {e.user ? `${e.user.name} (${roleLabel[e.user.role]})` : "appareil non identifié"}
                    {e.ipAddress && <> · IP {e.ipAddress}</>}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}

      {cursor && (
        <button onClick={() => void more()} disabled={loadingMore} className="mx-auto flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold shadow-sm">
          {loadingMore && <Loader2 size={16} className="animate-spin" />} Charger plus
        </button>
      )}
    </div>
  );
}
