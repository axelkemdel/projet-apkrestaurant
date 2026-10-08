import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { formatPrice } from "../../lib/format";
import { useTranslation } from "react-i18next";
import { categoryName, itemDescription, itemName, useLang } from "../../lib/localize";
import type { Category, MenuItem } from "../../types";

function hasOptions(item: MenuItem) {
  const o = item.options;
  return Boolean(o?.cooking?.length || o?.sides?.length || o?.extras?.length);
}

export function MenuBrowser({
  categories,
  onQuickAdd,
  onCustomize,
}: {
  categories: Category[];
  onQuickAdd: (item: MenuItem) => void;
  onCustomize: (item: MenuItem) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      // La recherche porte sur toute la carte, quelle que soit la catégorie active
      // Recherche dans les deux langues (un serveur peut taper « chicken » ou « poulet »)
      return categories.flatMap((c) => c.items).filter((i) => `${i.nameFr} ${i.nameEn}`.toLowerCase().includes(q));
    }
    return categories.find((c) => c.id === activeCat)?.items ?? [];
  }, [categories, activeCat, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white p-3">
        <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5">
          <Search size={18} className="text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("order.searchPlaceholder")}
            className="flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("order.clearSearch")}>
              <X size={16} className="text-slate-400" />
            </button>
          )}
        </label>
        {!query && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                  activeCat === c.id ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {categoryName(c, lang)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 pb-28 sm:grid-cols-3 xl:grid-cols-4 lg:pb-3">
        {items.map((item) => {
          const unavailable = !item.isAvailable;
          return (
            <motion.div
              key={item.id}
              whileTap={unavailable ? undefined : { scale: 0.97 }}
              className={`relative flex min-h-28 flex-col rounded-2xl border bg-white p-3 text-left shadow-sm ${
                unavailable ? "border-slate-200 opacity-50" : "border-slate-200 hover:border-brand-400"
              }`}
            >
              <button
                disabled={unavailable}
                onClick={() => (hasOptions(item) ? onCustomize(item) : onQuickAdd(item))}
                className="flex flex-1 flex-col text-left disabled:cursor-not-allowed"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="-mx-3 -mt-3 mb-2 h-24 w-[calc(100%+1.5rem)] max-w-none rounded-t-2xl object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
                <span className="pr-8 font-semibold leading-tight">{itemName(item, lang)}</span>
                {itemDescription(item, lang) && <span className="mt-1 line-clamp-2 text-xs text-slate-500">{itemDescription(item, lang)}</span>}
                <span className="mt-auto pt-2 font-bold text-brand-600">
                  {unavailable ? <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs uppercase text-white">{t("order.soldOut")}</span> : formatPrice(item.price)}
                </span>
              </button>
              {!unavailable && (
                <button
                  onClick={() => onCustomize(item)}
                  className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t("order.customize", { name: itemName(item, lang) })}
                >
                  {hasOptions(item) ? <SlidersHorizontal size={16} /> : <Plus size={16} />}
                </button>
              )}
            </motion.div>
          );
        })}
        {items.length === 0 && <p className="col-span-full py-10 text-center text-slate-400">{t("order.noResults")}</p>}
      </div>
    </div>
  );
}
