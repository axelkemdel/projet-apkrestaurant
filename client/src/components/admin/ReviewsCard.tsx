import { useEffect, useState } from "react";
import { MessageSquareQuote, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { formatDateTime } from "../../lib/format";
import type { ReviewsSummary } from "../../types";

/** Avis laissés par les clients depuis le portail QR : note moyenne, répartition, derniers commentaires. */
export function ReviewsCard() {
  const { t } = useTranslation();
  const [data, setData] = useState<ReviewsSummary | null>(null);

  useEffect(() => {
    const load = () => api<ReviewsSummary>("/admin/reviews?limit=8").then(setData).catch(() => setData(null));
    void load();
    // Un avis suit généralement un service ou un encaissement
    const s = getSocket();
    s.on("payment_recorded", load);
    return () => {
      s.off("payment_recorded", load);
    };
  }, []);

  if (!data) return null;
  const max = Math.max(1, ...data.distribution.map((d) => d.count));

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-slate-900">
        <MessageSquareQuote size={18} className="text-brand-600" /> {t("reviews.title")}
      </h3>
      {data.count === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{t("reviews.empty")}</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div>
            <div className="text-sm text-slate-500">{t("reviews.average")}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{data.average?.toLocaleString(undefined, { minimumFractionDigits: 1 })}</span>
              <span className="text-slate-400">/ 5</span>
            </div>
            <Stars value={Math.round(data.average ?? 0)} />
            <div className="mt-1 text-sm text-slate-500">{t("reviews.count", { count: data.count })}</div>
            <ul className="mt-4 space-y-1.5">
              {[...data.distribution].reverse().map((d) => (
                <li key={d.rating} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-3 tabular-nums">{d.rating}</span>
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(d.count / max) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="divide-y divide-slate-100 lg:col-span-2">
            {data.items.map((r) => (
              <li key={r.id} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars value={r.rating} />
                  <span className="text-xs text-slate-400">
                    {t("reviews.tableOrder", { table: r.table, order: r.order ?? "—" })} · {formatDateTime(r.createdAt)}
                    {r.language === "EN" && <span className="ml-1.5 rounded bg-sky-50 px-1 font-bold text-sky-700">EN</span>}
                  </span>
                </div>
                <p className={`mt-1 text-sm ${r.comment ? "text-slate-700" : "italic text-slate-400"}`}>{r.comment ?? t("reviews.noComment")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stars({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-0.5" role="img" aria-label={t("portal.review.star", { count: value })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={16} className={i <= value ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
      ))}
    </span>
  );
}
