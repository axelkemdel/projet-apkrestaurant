import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, UtensilsCrossed, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { categoryName, itemDescription, itemName, useLang } from "../../lib/localize";
import type { Category, MenuItem } from "../../types";

export const hasOptions = (item: MenuItem) => Boolean(item.options?.cooking?.length || item.options?.sides?.length || item.options?.extras?.length);

/**
 * Carte du portail client : toutes les catégories en sections, puces de navigation
 * qui suivent le défilement, recherche dans les deux langues, grandes photos.
 */
export function GuestMenu({
  categories,
  ordering,
  money,
  stickyOffset,
  onOpen,
  onQuickAdd,
}: {
  categories: Category[];
  ordering: boolean;
  money: (n: number) => string;
  /** Hauteur de l'en-tête collant au-dessus des puces de catégories (px) */
  stickyOffset: number;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(categories[0]?.id ?? "");
  const chipsRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return categories
      .flatMap((c) => c.items)
      .filter((i) => `${i.nameFr} ${i.nameEn} ${i.descriptionFr ?? ""} ${i.descriptionEn ?? ""}`.toLowerCase().includes(q));
  }, [categories, query]);

  // Puce active = section visible en haut de l'écran
  useEffect(() => {
    if (results) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: `-${stickyOffset + 70}px 0px -60% 0px` },
    );
    categories.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categories, results, stickyOffset]);

  // La puce active reste visible dans la barre défilante
  useEffect(() => {
    chipsRef.current?.querySelector(`[data-cat="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  function goTo(id: string) {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActive(id);
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - stickyOffset - 64, behavior: "smooth" });
  }

  return (
    <div>
      <div className="sticky z-20 -mx-4 space-y-2 bg-slate-50/95 px-4 pb-2 pt-3 backdrop-blur" style={{ top: stickyOffset }}>
        <label className="flex min-h-12 items-center gap-2 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-brand-500">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("portal.search")}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("order.clearSearch")} className="-mr-2 flex h-11 w-11 items-center justify-center">
              <X size={18} className="text-slate-400" />
            </button>
          )}
        </label>
        {!results && (
          <div ref={chipsRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {categories.map((c) => (
              <button
                key={c.id}
                data-cat={c.id}
                onClick={() => goTo(c.id)}
                className={`relative min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors ${
                  active === c.id ? "text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {active === c.id && <motion.span layoutId="guest-cat" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className="relative">{categoryName(c, lang)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {results ? (
        <div className="pt-2">
          {results.length === 0 ? (
            <p className="py-16 text-center text-slate-400">{t("portal.noResults")}</p>
          ) : (
            <ItemGrid items={results} ordering={ordering} money={money} onOpen={onOpen} onQuickAdd={onQuickAdd} />
          )}
        </div>
      ) : (
        categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-40 pt-4">
            <h2 className="mb-3 text-lg font-bold text-slate-900">{categoryName(c, lang)}</h2>
            <ItemGrid items={c.items} ordering={ordering} money={money} onOpen={onOpen} onQuickAdd={onQuickAdd} />
          </section>
        ))
      )}
    </div>
  );
}

function ItemGrid({
  items,
  ordering,
  money,
  onOpen,
  onQuickAdd,
}: {
  items: MenuItem[];
  ordering: boolean;
  money: (n: number) => string;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const soldOut = !item.isAvailable;
        const name = itemName(item, lang);
        const description = itemDescription(item, lang);
        return (
          <motion.li
            key={item.id}
            layout="position"
            whileTap={soldOut ? undefined : { scale: 0.98 }}
            className={`relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 ${soldOut ? "opacity-60" : ""}`}
          >
            <button
              disabled={soldOut}
              onClick={() => onOpen(item)}
              className="flex w-full gap-3 p-3 text-left disabled:cursor-not-allowed sm:flex-col sm:p-0"
              aria-label={name}
            >
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-100 to-amber-50 sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover ${soldOut ? "grayscale" : ""}`}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-brand-300">
                    <UtensilsCrossed size={28} />
                  </span>
                )}
                {soldOut && (
                  <span className="absolute inset-x-0 bottom-0 bg-slate-900/80 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-white">
                    {t("portal.soldOut")}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col sm:px-4 sm:pb-4">
                <span className="pr-10 font-semibold leading-snug text-slate-900 sm:pr-0">{name}</span>
                {description && <span className="mt-1 line-clamp-2 text-sm text-slate-500">{description}</span>}
                <span className="mt-auto pt-2 font-bold text-brand-600">{money(item.price)}</span>
              </div>
            </button>
            {ordering && !soldOut && (
              <button
                onClick={() => (hasOptions(item) ? onOpen(item) : onQuickAdd(item))}
                className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-md shadow-brand-500/30 active:scale-95"
                aria-label={`${t("portal.add")} — ${name}`}
              >
                <Plus size={22} />
              </button>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
