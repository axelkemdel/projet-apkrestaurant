import { useEffect, useMemo, useState } from "react";
import { ImageOff, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { Modal } from "../Modal";
import { Switch } from "./Switch";
import { api } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import type { AdminCategory, AdminMenuItem, Extra } from "../../types";

const COOKING_PRESETS = ["Bleu", "Saignant", "À point", "Bien cuit"];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Création / édition d'un plat. `item === undefined` : fermé ; `null` : nouveau plat. */
export function MenuItemForm({
  item,
  categories,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  item: AdminMenuItem | null | undefined;
  categories: AdminCategory[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: (item: AdminMenuItem) => void;
}) {
  const open = item !== undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [cooking, setCooking] = useState<string[]>([]);
  const [sides, setSides] = useState<string[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setPrice(item ? String(item.price) : "");
    setCategoryId(item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
    setIsAvailable(item?.isAvailable ?? true);
    setCooking(item?.options?.cooking ?? []);
    setSides(item?.options?.sides ?? []);
    setExtras(item?.options?.extras ?? []);
    const external = item?.imageUrl && !item.imageUrl.startsWith("/uploads/");
    setImageMode(external ? "url" : "upload");
    setImageUrl(external ? item!.imageUrl! : "");
    setFile(null);
    setRemoveImage(false);
    setError(null);
  }, [open, item, defaultCategoryId, categories]);

  // Aperçu dynamique : fichier choisi > URL saisie > image actuelle
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);
  const preview = removeImage
    ? null
    : imageMode === "upload"
      ? (fileUrl ?? (item?.imageUrl?.startsWith("/uploads/") ? item.imageUrl : null))
      : imageUrl.trim() || null;

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) return setError("Format accepté : JPEG, PNG ou WebP");
    if (f.size > MAX_IMAGE_BYTES) return setError("Image trop lourde (3 Mo maximum)");
    setError(null);
    setFile(f);
    setRemoveImage(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (extras.some((x) => !x.name.trim())) return setError("Chaque supplément doit avoir un nom");
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("description", description.trim());
    fd.set("price", String(Number(price)));
    fd.set("categoryId", categoryId);
    fd.set("isAvailable", String(isAvailable));
    fd.set("options", JSON.stringify({ cooking, sides, extras: extras.map((x) => ({ name: x.name.trim(), price: x.price })) }));
    if (removeImage) fd.set("removeImage", "true");
    else if (imageMode === "upload" && file) fd.set("image", file);
    else if (imageMode === "url") fd.set("imageUrl", imageUrl.trim());

    setSaving(true);
    setError(null);
    try {
      const saved = await api<AdminMenuItem>(item ? `/admin/menu/${item.id}` : "/admin/menu", {
        method: item ? "PUT" : "POST",
        body: fd,
      });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const station = categories.find((c) => c.id === categoryId)?.station;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Modifier « ${item.name} »` : "Nouveau plat"}
      footer={
        <div className="flex items-center gap-3">
          {error && <p className="flex-1 text-sm font-medium text-red-600">{error}</p>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2.5 font-semibold hover:bg-slate-200">
            Annuler
          </button>
          <button
            type="submit"
            form="menu-item-form"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      }
    >
      <form id="menu-item-form" onSubmit={submit} className="space-y-4">
        {/* Image */}
        <div className="flex gap-4">
          <div className="flex h-28 w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {preview ? (
              <img src={preview} alt="Aperçu" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.opacity = "0.2")} />
            ) : (
              <ImageOff className="text-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              {(
                [
                  ["upload", "Téléverser", Upload],
                  ["url", "Lien URL", Link2],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setImageMode(mode)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 ${imageMode === mode ? "bg-white shadow-sm" : "text-slate-500"}`}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            {imageMode === "upload" ? (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:border-brand-400">
                <Upload size={16} />
                <span className="truncate">{file ? file.name : "Choisir une photo (JPEG, PNG, WebP · 3 Mo)"}</span>
                <input type="file" accept={ACCEPTED.join(",")} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
            ) : (
              <input
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setRemoveImage(false);
                }}
                type="url"
                placeholder="https://res.cloudinary.com/…/plat.jpg"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              />
            )}
            {(item?.imageUrl || file || imageUrl) && !removeImage && (
              <button
                type="button"
                onClick={() => {
                  setRemoveImage(true);
                  setFile(null);
                  setImageUrl("");
                }}
                className="text-xs font-medium text-red-600"
              >
                Retirer l'image
              </button>
            )}
          </div>
        </div>

        <Field label="Nom du plat">
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea maxLength={300} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (FCFA)">
            <input
              required
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label={`Catégorie${station ? ` · ${station === "BAR" ? "écran Bar" : "écran Cuisine"}` : ""}`}>
            <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.station === "BAR" ? "Bar" : "Cuisine"})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-sm font-medium">Disponible à la vente</span>
          <Switch checked={isAvailable} onChange={setIsAvailable} label="Disponible à la vente" />
        </label>

        <TagInput label="Cuissons proposées" values={cooking} onChange={setCooking} presets={COOKING_PRESETS} placeholder="Ex : Saignant" />
        <TagInput label="Accompagnements" values={sides} onChange={setSides} placeholder="Ex : Attiéké, Frites…" />

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-slate-700">Suppléments</legend>
          <div className="space-y-2">
            {extras.map((x, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={x.name}
                  maxLength={40}
                  onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                  placeholder="Nom"
                  className={`${inputBase} min-w-0 flex-1`}
                />
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={x.price}
                  onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, price: Math.max(0, Number(e.target.value)) } : y)))}
                  className={`${inputBase} w-28 shrink-0`}
                  aria-label="Prix du supplément"
                />
                <button type="button" onClick={() => setExtras(extras.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-400 hover:text-red-600" aria-label="Retirer">
                  <X size={18} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setExtras([...extras, { name: "", price: 0 }])}
              className="flex items-center gap-1 text-sm font-semibold text-brand-600"
            >
              <Plus size={15} /> Ajouter un supplément
            </button>
            {extras.length > 0 && price && (
              <p className="text-xs text-slate-500">
                Exemple : {name || "le plat"} + {extras[0].name || "supplément"} = {formatPrice(Number(price) + extras[0].price)}
              </p>
            )}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

const inputBase = "rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500";
const inputCls = `w-full ${inputBase}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function TagInput({
  label,
  values,
  onChange,
  presets = [],
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  presets?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase()) && values.length < 12) onChange([...values, t]);
    setDraft("");
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 p-2 focus-within:border-brand-500">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-lg bg-slate-900 py-1 pl-2.5 pr-1 text-sm text-white">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Retirer ${v}`}>
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          maxLength={40}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => draft && add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-24 flex-1 px-1 py-1 text-sm outline-none"
        />
      </div>
      {presets.some((p) => !values.includes(p)) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {presets
            .filter((p) => !values.includes(p))
            .map((p) => (
              <button key={p} type="button" onClick={() => add(p)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">
                + {p}
              </button>
            ))}
        </div>
      )}
    </fieldset>
  );
}
