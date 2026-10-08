import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChefHat, Eye, EyeOff, ImageOff, Loader2, Martini, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { toast } from "../Toasts";
import { Switch } from "./Switch";
import { MenuItemForm } from "./MenuItemForm";
import { api } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { formatPrice } from "../../lib/format";
import type { AdminCategory, AdminMenuItem, Lang, Station } from "../../types";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { categoryName, itemDescription, itemName, pick, useLang } from "../../lib/localize";

type Filter = "ALL" | "SOLD_OUT" | "HIDDEN";

export function MenuTab() {
  const { t } = useTranslation();
  const lang = useLang();
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<AdminMenuItem | null | undefined>(undefined);
  const [newInCategory, setNewInCategory] = useState<string | undefined>();
  const [categoryForm, setCategoryForm] = useState<AdminCategory | null | undefined>(undefined);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    api<AdminCategory[]>("/admin/menu")
      .then(setCategories)
      .catch((e) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    // Un autre poste gérant modifie la carte : on se resynchronise
    const s = getSocket();
    s.on("menu_updated", load);
    return () => {
      s.off("menu_updated", load);
    };
  }, [load]);

  const replaceItem = (item: AdminMenuItem) =>
    setCategories((cats) =>
      cats?.map((c) => ({
        ...c,
        items: c.id === item.categoryId ? [...c.items.filter((i) => i.id !== item.id), item].sort((a, b) => a.nameFr.localeCompare(b.nameFr)) : c.items.filter((i) => i.id !== item.id),
      })) ?? null,
    );

  async function run(id: string, fn: () => Promise<void>) {
    setPending((s) => new Set(s).add(id));
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
      load();
    } finally {
      setPending((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  /** Rupture de stock : bascule immédiate, diffusée aux tablettes par le serveur (menu_updated). */
  const toggleAvailability = (item: AdminMenuItem, isAvailable: boolean) =>
    run(item.id, async () => {
      replaceItem({ ...item, isAvailable }); // optimiste
      const saved = await api<AdminMenuItem>(`/admin/menu/${item.id}/toggle-availability`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable }),
      });
      replaceItem(saved);
      const name = itemName(item, lang);
      toast.success(isAvailable ? t("menuAdmin.backOnSale", { name }) : t("menuAdmin.markedSoldOut", { name }));
    });

  const toggleHidden = (item: AdminMenuItem) =>
    run(item.id, async () => {
      const fd = new FormData();
      fd.set("isArchived", String(!item.isArchived));
      replaceItem(await api<AdminMenuItem>(`/admin/menu/${item.id}`, { method: "PUT", body: fd }));
      const name = itemName(item, lang);
      toast.success(item.isArchived ? t("menuAdmin.shownAgain", { name }) : t("menuAdmin.hidden", { name }));
    });

  const remove = (item: AdminMenuItem) => {
    if (!confirm(t("menuAdmin.confirmDelete", { name: itemName(item, lang) }))) return;
    void run(item.id, async () => {
      await api(`/admin/menu/${item.id}`, { method: "DELETE" });
      setCategories((cats) => cats?.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) })) ?? null);
      toast.success(t("menuAdmin.deleted", { name: itemName(item, lang) }));
    });
  };

  const removeCategory = (c: AdminCategory) => {
    if (!confirm(t("menuAdmin.confirmDeleteCategory", { name: categoryName(c, lang) }))) return;
    void run(c.id, async () => {
      await api(`/admin/categories/${c.id}`, { method: "DELETE" });
      load();
    });
  };

  const all = useMemo(() => categories?.flatMap((c) => c.items) ?? [], [categories]);
  const counts = { ALL: all.length, SOLD_OUT: all.filter((i) => !i.isAvailable).length, HIDDEN: all.filter((i) => i.isArchived).length };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (categories ?? []).map((c) => ({
      ...c,
      items: c.items.filter(
        (i) =>
          (!q || `${i.nameFr} ${i.nameEn}`.toLowerCase().includes(q)) &&
          (filter === "ALL" || (filter === "SOLD_OUT" ? !i.isAvailable : i.isArchived)),
      ),
    }));
  }, [categories, query, filter]);

  if (!categories) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-12 w-full items-center gap-2 rounded-xl bg-white px-3 shadow-sm lg:w-auto lg:min-w-56 lg:flex-1">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("menuAdmin.search")} className="flex-1 bg-transparent outline-none" />
        </label>
        <div className="flex flex-1 rounded-xl bg-white p-1 shadow-sm sm:flex-none">
          {(
            [
              ["ALL", t("menuAdmin.filterAll")],
              ["SOLD_OUT", t("menuAdmin.filterSoldOut")],
              ["HIDDEN", t("menuAdmin.filterHidden")],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap sm:flex-none ${filter === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label} <span className="opacity-60">{counts[v]}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setCategoryForm(null)} className="min-h-12 flex-1 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 sm:flex-none">
          {t("menuAdmin.newCategory")}
        </button>
        <button
          onClick={() => {
            setNewInCategory(undefined);
            setEditing(null);
          }}
          className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 sm:flex-none"
        >
          <Plus size={16} /> {t("menuAdmin.newDish")}
        </button>
      </div>

      {visible.map((cat) => (
        <section key={cat.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <header className="flex items-center gap-2 border-b border-slate-100 py-1 pl-4 pr-2 sm:gap-3">
            <h3 className="font-semibold">{categoryName(cat, lang)}</h3>
            <StationBadge station={cat.station} />
            <span className="hidden text-sm text-slate-400 sm:inline">{t("stats.itemsCount", { count: cat.items.length })}</span>
            <div className="flex-1" />
            <button onClick={() => setCategoryForm(cat)} className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("menuAdmin.editCategoryNamed", { name: categoryName(cat, lang) })}>
              <Pencil size={15} />
            </button>
            {categories.find((c) => c.id === cat.id)?.items.length === 0 && (
              <button onClick={() => removeCategory(cat)} className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={t("menuAdmin.deleteCategoryNamed", { name: categoryName(cat, lang) })}>
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={() => {
                setNewInCategory(cat.id);
                setEditing(null);
              }}
              className="flex min-h-12 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Plus size={15} /> {t("menuAdmin.add")}
            </button>
          </header>
          <ul className="divide-y divide-slate-100">
            <AnimatePresence initial={false}>
              {cat.items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex flex-wrap items-center gap-x-3 px-3 py-2 sm:flex-nowrap sm:px-4 ${item.isArchived ? "bg-slate-50" : ""}`}
                >
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ${item.isArchived ? "opacity-40" : ""}`}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff size={18} className="text-slate-300" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${item.isArchived ? "opacity-50" : ""}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{itemName(item, lang)}</span>
                      {!item.isAvailable && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{t("order.soldOut")}</span>}
                      {item.isArchived && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">{t("menuAdmin.hiddenBadge")}</span>}
                    </div>
                    {/* Libellé dans l'autre langue : le gérant voit d'un coup d'œil si la traduction est faite */}
                    <div className="truncate text-xs text-slate-400" lang={lang === "fr" ? "en" : "fr"}>
                      {lang === "fr" ? "EN" : "FR"} · {itemName(item, lang === "fr" ? "en" : "fr")}
                    </div>
                    <div className="truncate text-xs text-slate-500">{optionsSummary(item, lang, t) || itemDescription(item, lang) || "—"}</div>
                    <div className="font-semibold tabular-nums sm:hidden">{formatPrice(item.price)}</div>
                  </div>
                  <span className="hidden w-24 text-right font-semibold tabular-nums sm:block">{formatPrice(item.price)}</span>
                  {/* Commandes : sous le plat sur smartphone, alignées à droite au-delà */}
                  <div className="flex w-full items-center justify-between border-t border-slate-100 pl-[4.25rem] sm:w-auto sm:justify-end sm:border-0 sm:pl-0">
                    <label className="flex items-center gap-1">
                      <span className={`text-xs ${item.isAvailable ? "text-emerald-700" : "text-slate-500"}`}>{item.isAvailable ? t("menuAdmin.onSale") : t("menuAdmin.outOfStock")}</span>
                      <Switch
                        checked={item.isAvailable}
                        disabled={pending.has(item.id) || item.isArchived}
                        onChange={(v) => void toggleAvailability(item, v)}
                        label={t("menuAdmin.availableLabel", { name: itemName(item, lang) })}
                      />
                    </label>
                    <div className="flex items-center">
                      <IconButton label={t("common.edit")} onClick={() => setEditing(item)}>
                        <Pencil size={18} />
                      </IconButton>
                      <IconButton label={item.isArchived ? t("menuAdmin.show") : t("menuAdmin.hide")} onClick={() => void toggleHidden(item)} disabled={pending.has(item.id)}>
                        {item.isArchived ? <Eye size={18} /> : <EyeOff size={18} />}
                      </IconButton>
                      <IconButton
                        label={item.deletable ? t("menuAdmin.deleteForever") : t("menuAdmin.cannotDelete", { count: item.timesOrdered })}
                        onClick={() => remove(item)}
                        disabled={!item.deletable || pending.has(item.id)}
                        danger
                      >
                        <Trash2 size={18} />
                      </IconButton>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {cat.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">{t("menuAdmin.noItems")}</li>}
          </ul>
        </section>
      ))}

      <MenuItemForm
        item={editing}
        categories={categories}
        defaultCategoryId={newInCategory}
        onClose={() => setEditing(undefined)}
        onSaved={(saved) => {
          replaceItem(saved);
          setEditing(undefined);
          toast.success(t("menuAdmin.saved", { name: itemName(saved, lang) }));
        }}
      />
      <CategoryForm category={categoryForm} onClose={() => setCategoryForm(undefined)} onSaved={() => (setCategoryForm(undefined), load())} />
    </div>
  );
}

function optionsSummary(item: AdminMenuItem, lang: Lang, t: TFunction) {
  const o = item.options;
  if (!o) return "";
  return [
    o.cooking?.length && t("menuAdmin.cookingCount", { count: o.cooking.length }),
    o.sides?.length && t("menuAdmin.sidesList", { list: o.sides.map((x) => pick(x, lang)).join(", ") }),
    o.extras?.length && t("menuAdmin.extrasList", { list: o.extras.map((x) => pick(x, lang)).join(", ") }),
  ]
    .filter(Boolean)
    .join(" · ");
}

function StationBadge({ station }: { station: Station }) {
  const { t } = useTranslation();
  return station === "BAR" ? (
    <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
      <Martini size={12} /> {t("kds.bar")}
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      <ChefHat size={12} /> {t("nav.kitchen")}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 disabled:cursor-not-allowed disabled:opacity-30 ${danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: AdminCategory | null | undefined; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [nameFr, setNameFr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [station, setStation] = useState<Station>("KITCHEN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category === undefined) return;
    setNameFr(category?.nameFr ?? "");
    setNameEn(category?.nameEn ?? "");
    setStation(category?.station ?? "KITCHEN");
  }, [category]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(category ? `/admin/categories/${category.id}` : "/admin/categories", {
        method: category ? "PUT" : "POST",
        body: JSON.stringify({ nameFr: nameFr.trim(), nameEn: nameEn.trim(), station }),
      });
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={category !== undefined} onClose={onClose} title={category ? t("menuAdmin.editCategory") : t("menuAdmin.newCategory")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["fr", nameFr, setNameFr],
              ["en", nameEn, setNameEn],
            ] as const
          ).map(([l, value, set]) => (
            <label key={l} className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                {t("menuAdmin.nameIn", { lang: t(l === "fr" ? "kds.langFr" : "kds.langEn") })}
              </span>
              <input
                required
                lang={l}
                maxLength={40}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-brand-500"
              />
            </label>
          ))}
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-slate-700">{t("menuAdmin.prepScreen")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["KITCHEN", t("nav.kitchen"), ChefHat],
                ["BAR", t("kds.bar"), Martini],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setStation(v)}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 font-semibold ${station === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
        </fieldset>
        <button disabled={saving} className="min-h-12 w-full rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {t("common.save")}
        </button>
      </form>
    </Modal>
  );
}
