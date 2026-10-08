import { useEffect, useState } from "react";
import { BadgePercent, Loader2 } from "lucide-react";
import { Modal } from "../Modal";
import { api } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import { toast } from "../Toasts";
import { useTranslation } from "react-i18next";
import { DISCOUNT_REASONS, formatPercent, pick, useLang } from "../../lib/localize";
import type { Bill } from "../../types";


/**
 * Remise sur l'addition. Le serveur applique les garde-fous anti-fraude
 * (motif obligatoire, plafond pour les caissiers, trace dans le journal d'audit).
 */
export function DiscountModal({
  bill,
  open,
  onClose,
  onApplied,
}: {
  bill: Bill;
  open: boolean;
  onClose: () => void;
  onApplied: (closed: boolean) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [kind, setKind] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind("PERCENT");
    setValue("");
    setReason("");
    setError(null);
  }, [open]);

  const v = Number(value || 0);
  const amount = kind === "PERCENT" ? Math.round((bill.totals.total * v) / 100) : v;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const target = bill.target.kind === "table" ? { tableId: bill.target.table.id } : { orderId: bill.target.order.id };
      const res = await api<{ amount: number; closed: boolean }>("/checkout/discount", {
        method: "POST",
        body: JSON.stringify({ ...target, kind, value: v, reason: reason.trim() }),
      });
      toast.success(t("discount.applied", { amount: formatPrice(res.amount) }));
      onApplied(res.closed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <BadgePercent className="text-amber-600" /> {t("discount.title")}
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["PERCENT", t("discount.percent")],
              ["AMOUNT", t("discount.amount")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${kind === k ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            required
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, kind === "PERCENT" ? 3 : 8))}
            inputMode="numeric"
            placeholder={kind === "PERCENT" ? t("discount.percentExample") : t("discount.amountExample")}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-lg font-semibold outline-none focus:border-brand-500"
            aria-label={kind === "PERCENT" ? t("discount.percentLabel") : t("discount.amountLabel")}
          />
          {kind === "PERCENT" &&
            [5, 10, 15].map((p) => (
              <button key={p} type="button" onClick={() => setValue(String(p))} className="min-h-12 rounded-xl bg-slate-100 px-3 text-sm font-semibold">
                {formatPercent(p, lang)}
              </button>
            ))}
        </div>
        <div>
          <label htmlFor="discount-reason" className="mb-1 block text-sm font-semibold text-slate-700">
            {t("discount.reasonLabel")}
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {/* Motifs proposés : enregistrés en français (forme canonique), affichés traduits */}
            {DISCOUNT_REASONS.map((r) => (
              <button
                key={r.fr}
                type="button"
                onClick={() => setReason(r.fr)}
                aria-pressed={reason === r.fr}
                className={`min-h-10 rounded-full px-3 text-sm ${reason === r.fr ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {pick(r, lang)}
              </button>
            ))}
          </div>
          <input
            id="discount-reason"
            required
            minLength={3}
            maxLength={120}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-brand-500"
          />
        </div>
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("discount.preview", {
            amount: formatPrice(amount),
            total: formatPrice(bill.totals.total),
            remaining: formatPrice(Math.max(0, bill.totals.remaining - amount)),
          })}
          <p className="mt-1 text-xs opacity-80">{t("discount.capHint")}</p>
        </div>
        {error && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={saving || amount < 1 || reason.trim().length < 3}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-slate-950 disabled:opacity-50"
        >
          {saving && <Loader2 size={16} className="animate-spin" />} {t("discount.apply")}
        </button>
      </form>
    </Modal>
  );
}
