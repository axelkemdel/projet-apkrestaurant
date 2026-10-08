import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Ban, BadgePercent, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck, Tag, Trash2, UserCog, UserPlus, UtensilsCrossed } from "lucide-react";
import { api } from "../../lib/api";
import { formatDateTime, formatPrice } from "../../lib/format";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { discountReason, useLang } from "../../lib/localize";
import { toast } from "../Toasts";
import type { AuditAction, AuditLogEntry, Lang, Role } from "../../types";

const ACTIONS: Record<AuditAction, { Icon: typeof Ban; tone: string }> = {
  ORDER_CANCELLED: { Icon: Ban, tone: "bg-red-50 text-red-700" },
  DISCOUNT_APPLIED: { Icon: BadgePercent, tone: "bg-amber-50 text-amber-800" },
  MENU_PRICE_CHANGED: { Icon: Tag, tone: "bg-amber-50 text-amber-800" },
  MENU_ITEM_CREATED: { Icon: UtensilsCrossed, tone: "bg-slate-100 text-slate-700" },
  MENU_ITEM_DELETED: { Icon: Trash2, tone: "bg-slate-100 text-slate-700" },
  PIN_RESET: { Icon: KeyRound, tone: "bg-sky-50 text-sky-800" },
  USER_CREATED: { Icon: UserPlus, tone: "bg-sky-50 text-sky-800" },
  USER_ROLE_CHANGED: { Icon: UserCog, tone: "bg-sky-50 text-sky-800" },
  USER_STATUS_CHANGED: { Icon: UserCog, tone: "bg-sky-50 text-sky-800" },
  LOGIN_LOCKED: { Icon: Lock, tone: "bg-red-50 text-red-700" },
};

const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => String(v ?? "");

/** Nom de plat consigné : bilingue (nameFr / nameEn) ou ancien format (name). */
function dishName(d: Record<string, unknown>, lang: Lang): string {
  if (typeof d.nameFr === "string") return lang === "en" && typeof d.nameEn === "string" ? d.nameEn : d.nameFr;
  return s(d.name);
}

const roleName = (r: unknown, t: TFunction) => (["ADMIN", "SERVEUR", "CUISINE", "CAISSE"].includes(s(r)) ? t(`roles.${r as Role}`) : s(r));

/** Résumé lisible (et traduit) du détail JSON enregistré par le serveur. */
function describe(e: AuditLogEntry, t: TFunction, lang: Lang): string {
  const d = e.details;
  const table = d.table ? ` · ${t("common.table", { number: s(d.table) })}` : "";
  switch (e.action) {
    case "ORDER_CANCELLED": {
      const items = (d.items as Record<string, unknown>[] | undefined) ?? [];
      return t("audit.desc.orderCancelled", {
        number: s(d.orderNumber),
        table,
        amount: formatPrice(n(d.amount)),
        items: items.map((i) => `${s(i.quantity)}× ${dishName(i, lang)}`).join(", "),
      });
    }
    case "DISCOUNT_APPLIED":
      return t("audit.desc.discount", {
        value: d.kind === "PERCENT" ? `${s(d.value)} %` : formatPrice(n(d.value)),
        amount: formatPrice(n(d.amount)),
        total: formatPrice(n(d.billTotal)),
        table,
        reason: discountReason(s(d.reason), lang),
        pct: s(d.cumulatedPct),
      });
    case "MENU_PRICE_CHANGED": {
      const delta = n(d.newPrice) - n(d.oldPrice);
      return t("audit.desc.priceChanged", {
        name: dishName(d, lang),
        old: formatPrice(n(d.oldPrice)),
        new: formatPrice(n(d.newPrice)),
        delta: `${delta > 0 ? "+" : ""}${formatPrice(delta)}`,
      });
    }
    case "MENU_ITEM_CREATED":
      return t("audit.desc.itemCreated", { name: dishName(d, lang), price: formatPrice(n(d.price)) });
    case "MENU_ITEM_DELETED":
      return t("audit.desc.itemDeleted", { name: dishName(d, lang), price: formatPrice(n(d.price)) });
    case "PIN_RESET":
      return t(d.generated ? "audit.desc.pinGenerated" : "audit.desc.pinEntered", { name: s(d.name) });
    case "USER_CREATED":
      return t("audit.desc.userCreated", { name: s(d.name), role: roleName(d.role, t) });
    case "USER_ROLE_CHANGED":
      return t("audit.desc.roleChanged", { name: s(d.name), old: roleName(d.oldRole, t), new: roleName(d.newRole, t) });
    case "USER_STATUS_CHANGED":
      return t(d.isActive ? "audit.desc.userReactivated" : "audit.desc.userDeactivated", { name: s(d.name) });
    case "LOGIN_LOCKED":
      return t("audit.desc.loginLocked", { name: s(d.targetName) });
  }
}

export function AuditTab() {
  const { t } = useTranslation();
  const lang = useLang();
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
        {t("audit.notice")}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | "")}
          className="col-span-2 min-h-12 rounded-xl bg-white px-3 text-sm shadow-sm outline-none sm:w-64"
          aria-label={t("audit.filterAction")}
        >
          <option value="">{t("audit.allActions")}</option>
          {(Object.keys(ACTIONS) as AuditAction[]).map((k) => (
            <option key={k} value={k}>
              {t(`audit.actions.${k}`)}
            </option>
          ))}
        </select>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm shadow-sm">
          <span className="text-slate-400">{t("audit.from")}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <label className="flex min-h-12 items-center gap-2 rounded-xl bg-white px-3 text-sm shadow-sm">
          <span className="text-slate-400">{t("audit.to")}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <button onClick={load} className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-sm sm:col-span-1">
          <RefreshCw size={16} /> {t("common.refresh")}
        </button>
      </div>

      {!items ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400 shadow-sm">{t("audit.empty")}</p>
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
                    <span className="font-semibold text-slate-900">{t(`audit.actions.${e.action}`)}</span>
                    <time className="text-xs text-slate-500" dateTime={e.timestamp}>
                      {formatDateTime(e.timestamp)}
                    </time>
                  </div>
                  <p className="break-words text-sm text-slate-700">{describe(e, t, lang)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {e.user ? t("audit.by", { name: e.user.name, role: t(`roles.${e.user.role}`) }) : t("audit.byUnknown")}
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
          {loadingMore && <Loader2 size={16} className="animate-spin" />} {t("common.loadMore")}
        </button>
      )}
    </div>
  );
}
