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
import type { AdminCategory, AdminMenuItem, Station } from "../../types";

type Filter = "ALL" | "SOLD_OUT" | "HIDDEN";

export function MenuTab() {
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
        items: c.id === item.categoryId ? [...c.items.filter((i) => i.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)) : c.items.filter((i) => i.id !== item.id),
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
      toast.success(isAvailable ? `${item.name} remis en vente` : `${item.name} marqué épuisé sur les tablettes`);
    });

  const toggleHidden = (item: AdminMenuItem) =>
    run(item.id, async () => {
      const fd = new FormData();
      fd.set("isArchived", String(!item.isArchived));
      replaceItem(await api<AdminMenuItem>(`/admin/menu/${item.id}`, { method: "PUT", body: fd }));
      toast.success(item.isArchived ? `${item.name} réaffiché sur la carte` : `${item.name} masqué de la carte`);
    });

  const remove = (item: AdminMenuItem) => {
    if (!confirm(`Supprimer définitivement « ${item.name} » ?`)) return;
    void run(item.id, async () => {
      await api(`/admin/menu/${item.id}`, { method: "DELETE" });
      setCategories((cats) => cats?.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) })) ?? null);
      toast.success(`${item.name} supprimé`);
    });
  };

  const removeCategory = (c: AdminCategory) => {
    if (!confirm(`Supprimer la catégorie « ${c.name} » ?`)) return;
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
          (!q || i.name.toLowerCase().includes(q)) &&
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
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
          <Search size={16} className="text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un plat…" className="flex-1 bg-transparent outline-none" />
        </label>
        <div className="flex rounded-xl bg-white p-1 shadow-sm">
          {(
            [
              ["ALL", "Tous"],
              ["SOLD_OUT", "Épuisés"],
              ["HIDDEN", "Masqués"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {label} <span className="opacity-60">{counts[v]}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setCategoryForm(null)} className="rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50">
          Nouvelle catégorie
        </button>
        <button
          onClick={() => {
            setNewInCategory(undefined);
            setEditing(null);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          <Plus size={16} /> Nouveau plat
        </button>
      </div>

      {visible.map((cat) => (
        <section key={cat.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="font-semibold">{cat.name}</h3>
            <StationBadge station={cat.station} />
            <span className="text-sm text-slate-400">{cat.items.length} article{cat.items.length > 1 ? "s" : ""}</span>
            <div className="flex-1" />
            <button onClick={() => setCategoryForm(cat)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Modifier la catégorie ${cat.name}`}>
              <Pencil size={15} />
            </button>
            {categories.find((c) => c.id === cat.id)?.items.length === 0 && (
              <button onClick={() => removeCategory(cat)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Supprimer la catégorie ${cat.name}`}>
                <Trash2 size={15} />
              </button>
            )}
            <button
              onClick={() => {
                setNewInCategory(cat.id);
                setEditing(null);
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Plus size={15} /> Ajouter
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
                  className={`flex items-center gap-3 px-4 py-3 ${item.isArchived ? "bg-slate-50" : ""}`}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 ${item.isArchived ? "opacity-40" : ""}`}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff size={18} className="text-slate-300" />}
                  </div>
                  <div className={`min-w-0 flex-1 ${item.isArchived ? "opacity-50" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {!item.isAvailable && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Épuisé</span>}
                      {item.isArchived && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">Masqué</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">{optionsSummary(item) || item.description || "—"}</div>
                  </div>
                  <span className="w-24 text-right font-semibold tabular-nums">{formatPrice(item.price)}</span>
                  <div className="flex w-28 items-center justify-end gap-2">
                    <span className={`hidden text-xs sm:inline ${item.isAvailable ? "text-emerald-700" : "text-slate-500"}`}>{item.isAvailable ? "En vente" : "Rupture"}</span>
                    <Switch
                      checked={item.isAvailable}
                      disabled={pending.has(item.id) || item.isArchived}
                      onChange={(v) => void toggleAvailability(item, v)}
                      label={`${item.name} disponible`}
                    />
                  </div>
                  <div className="flex items-center">
                    <IconButton label="Modifier" onClick={() => setEditing(item)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={item.isArchived ? "Réafficher sur la carte" : "Masquer de la carte"} onClick={() => void toggleHidden(item)} disabled={pending.has(item.id)}>
                      {item.isArchived ? <Eye size={16} /> : <EyeOff size={16} />}
                    </IconButton>
                    <IconButton
                      label={item.deletable ? "Supprimer définitivement" : `Déjà commandé ${item.timesOrdered} fois : masquez-le plutôt`}
                      onClick={() => remove(item)}
                      disabled={!item.deletable || pending.has(item.id)}
                      danger
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {cat.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Aucun article</li>}
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
          toast.success(`${saved.name} enregistré`);
        }}
      />
      <CategoryForm category={categoryForm} onClose={() => setCategoryForm(undefined)} onSaved={() => (setCategoryForm(undefined), load())} />
    </div>
  );
}

function optionsSummary(item: AdminMenuItem) {
  const o = item.options;
  if (!o) return "";
  return [
    o.cooking?.length && `${o.cooking.length} cuissons`,
    o.sides?.length && `Accomp. : ${o.sides.join(", ")}`,
    o.extras?.length && `Suppl. : ${o.extras.map((e) => e.name).join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StationBadge({ station }: { station: Station }) {
  return station === "BAR" ? (
    <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
      <Martini size={12} /> Bar
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      <ChefHat size={12} /> Cuisine
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
      className={`rounded-lg p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-30 ${danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: AdminCategory | null | undefined; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("KITCHEN");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category === undefined) return;
    setName(category?.name ?? "");
    setStation(category?.station ?? "KITCHEN");
  }, [category]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(category ? `/admin/categories/${category.id}` : "/admin/categories", {
        method: category ? "PUT" : "POST",
        body: JSON.stringify({ name: name.trim(), station }),
      });
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={category !== undefined} onClose={onClose} title={category ? "Modifier la catégorie" : "Nouvelle catégorie"}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Nom</span>
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-slate-700">Écran de préparation</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["KITCHEN", "Cuisine", ChefHat],
                ["BAR", "Bar", Martini],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => setStation(v)}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 font-semibold ${station === v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
        </fieldset>
        <button disabled={saving} className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          Enregistrer
        </button>
      </form>
    </Modal>
  );
}
