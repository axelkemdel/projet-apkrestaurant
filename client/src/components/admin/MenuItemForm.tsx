import { useEffect, useMemo, useState } from "react";
import { Crop, ImageOff, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { ImageCropper } from "./ImageCropper";
import { Switch } from "./Switch";
import { api } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import { categoryName, itemName, useLang } from "../../lib/localize";
import type { AdminCategory, AdminMenuItem, Extra, Label } from "../../types";

const COOKING_PRESETS: Label[] = [
  { fr: "Bleu", en: "Blue rare" },
  { fr: "Saignant", en: "Rare" },
  { fr: "À point", en: "Medium" },
  { fr: "Bien cuit", en: "Well done" },
];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** Création / édition d'un plat bilingue. `item === undefined` : fermé ; `null` : nouveau plat. */
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
  const { t } = useTranslation();
  const lang = useLang();
  const open = item !== undefined;
  const [nameFr, setNameFr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [descriptionFr, setDescriptionFr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [cooking, setCooking] = useState<Label[]>([]);
  const [sides, setSides] = useState<Label[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [imageMode, setImageMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  /** Photo d'origine choisie, en cours de recadrage. */
  const [original, setOriginal] = useState<File | null>(null);
  const [cropping, setCropping] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNameFr(item?.nameFr ?? "");
    setNameEn(item?.nameEn ?? "");
    setDescriptionFr(item?.descriptionFr ?? "");
    setDescriptionEn(item?.descriptionEn ?? "");
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
    setOriginal(null);
    setCropping(false);
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
    if (!ACCEPTED.includes(f.type)) return setError(t("dishForm.badFormat"));
    if (f.size > MAX_IMAGE_BYTES) return setError(t("dishForm.tooLarge"));
    setError(null);
    setOriginal(f);
    setCropping(true);
    setRemoveImage(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const incomplete = [...cooking, ...sides, ...extras].some((x) => !x.fr.trim() || !x.en.trim());
    if (incomplete) return setError(t("dishForm.optionsIncomplete"));
    const clean = <T extends Label>(list: T[]) => list.map((x) => ({ ...x, fr: x.fr.trim(), en: x.en.trim() }));
    const fd = new FormData();
    fd.set("nameFr", nameFr.trim());
    fd.set("nameEn", nameEn.trim());
    fd.set("descriptionFr", descriptionFr.trim());
    fd.set("descriptionEn", descriptionEn.trim());
    fd.set("price", String(Number(price)));
    fd.set("categoryId", categoryId);
    fd.set("isAvailable", String(isAvailable));
    fd.set("options", JSON.stringify({ cooking: clean(cooking), sides: clean(sides), extras: clean(extras) }));
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
      title={item ? t("dishForm.editTitle", { name: itemName(item, lang) }) : t("menuAdmin.newDish")}
      footer={
        <div className="flex items-center gap-3">
          {error && <p className="flex-1 text-sm font-medium text-red-600">{error}</p>}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl bg-slate-100 px-4 font-semibold hover:bg-slate-200"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="menu-item-form"
            disabled={saving || cropping}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      }
    >
      <form id="menu-item-form" onSubmit={submit} className="space-y-4">
        {/* Image : recadrage 4:3 après sélection d'un fichier */}
        {cropping && original ? (
          <ImageCropper
            file={original}
            onCancel={() => setCropping(false)}
            onDone={(cropped) => {
              setFile(cropped);
              setCropping(false);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-36">
              {preview ? (
                <img
                  src={preview}
                  alt={t("dishForm.preview")}
                  className="h-full w-full object-cover"
                  onError={(e) => (e.currentTarget.style.opacity = "0.2")}
                />
              ) : (
                <ImageOff className="text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                {(
                  [
                    ["upload", t("dishForm.upload"), Upload],
                    ["url", t("dishForm.urlLink"), Link2],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setImageMode(mode)}
                    className={`flex min-h-10 flex-1 items-center justify-center gap-1 rounded-md ${imageMode === mode ? "bg-white shadow-sm" : "text-slate-500"}`}
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              {imageMode === "upload" ? (
                <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:border-brand-400">
                  <Upload size={16} />
                  <span className="truncate">{file ? t("dishForm.photoReady") : t("dishForm.choosePhoto")}</span>
                  <input
                    type="file"
                    accept={ACCEPTED.join(",")}
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
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
              <div className="flex flex-wrap gap-x-4">
                {original && imageMode === "upload" && (
                  <button
                    type="button"
                    onClick={() => setCropping(true)}
                    className="flex min-h-10 items-center gap-1 text-xs font-medium text-slate-700"
                  >
                    <Crop size={14} /> {t("dishForm.recrop")}
                  </button>
                )}
                {(item?.imageUrl || file || imageUrl) && !removeImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveImage(true);
                      setFile(null);
                      setImageUrl("");
                    }}
                    className="min-h-10 text-xs font-medium text-red-600"
                  >
                    {t("dishForm.removeImage")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Nom et description dans les deux langues (côte à côte sur tablette / ordinateur) */}
        <BilingualField
          label={t("dishForm.name")}
          fr={nameFr}
          en={nameEn}
          onFr={setNameFr}
          onEn={setNameEn}
          required
          maxLength={80}
        />
        <BilingualField
          label={t("dishForm.description")}
          fr={descriptionFr}
          en={descriptionEn}
          onFr={setDescriptionFr}
          onEn={setDescriptionEn}
          maxLength={300}
          multiline
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("dishForm.price")}>
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
          <Field
            label={
              station
                ? t("dishForm.categoryWithScreen", { screen: station === "BAR" ? t("kds.bar") : t("nav.kitchen") })
                : t("dishForm.category")
            }
          >
            <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c, lang)} ({c.station === "BAR" ? t("kds.bar") : t("nav.kitchen")})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1">
          <span className="text-sm font-medium">{t("dishForm.available")}</span>
          <Switch checked={isAvailable} onChange={setIsAvailable} label={t("dishForm.available")} />
        </label>

        <LabelListEditor label={t("dishForm.cookingOptions")} values={cooking} onChange={setCooking} presets={COOKING_PRESETS} />
        <LabelListEditor label={t("dishForm.sides")} values={sides} onChange={setSides} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-slate-700">{t("order.extras")}</legend>
          <div className="space-y-2">
            {extras.map((x, i) => (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_7rem_2.75rem] sm:bg-transparent sm:p-0"
              >
                <PairInput
                  lang="fr"
                  value={x.fr}
                  onChange={(v) => setExtras(extras.map((y, j) => (j === i ? { ...y, fr: v } : y)))}
                />
                <PairInput
                  lang="en"
                  value={x.en}
                  onChange={(v) => setExtras(extras.map((y, j) => (j === i ? { ...y, en: v } : y)))}
                />
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={x.price}
                  onChange={(e) =>
                    setExtras(extras.map((y, j) => (j === i ? { ...y, price: Math.max(0, Number(e.target.value)) } : y)))
                  }
                  className={`${inputBase} w-full`}
                  aria-label={t("dishForm.extraPrice")}
                />
                <button
                  type="button"
                  onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  className="flex min-h-12 items-center justify-center rounded-lg text-slate-400 hover:text-red-600"
                  aria-label={t("dishForm.remove")}
                >
                  <X size={18} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setExtras([...extras, { fr: "", en: "", price: 0 }])}
              className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-600"
            >
              <Plus size={15} /> {t("dishForm.addExtra")}
            </button>
            {extras.length > 0 && price && (
              <p className="text-xs text-slate-500">
                {t("dishForm.example", {
                  dish: (lang === "en" ? nameEn : nameFr) || t("dishForm.theDish"),
                  extra: (lang === "en" ? extras[0].en : extras[0].fr) || t("dishForm.anExtra"),
                  total: formatPrice(Number(price) + extras[0].price),
                })}
              </p>
            )}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

const inputBase = "min-h-12 rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500";
const inputCls = `w-full ${inputBase}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/** Saisie d'un libellé dans une langue, avec son badge FR / EN. */
function PairInput({
  lang,
  value,
  onChange,
  maxLength = 40,
}: {
  lang: "fr" | "en";
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded bg-slate-200 px-1 text-[10px] font-bold uppercase text-slate-600">
        {lang}
      </span>
      <input
        lang={lang}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t(lang === "fr" ? "kds.langFr" : "kds.langEn")}
        className={`${inputBase} w-full pl-9`}
      />
    </label>
  );
}

function BilingualField({
  label,
  fr,
  en,
  onFr,
  onEn,
  required,
  maxLength,
  multiline,
}: {
  label: string;
  fr: string;
  en: string;
  onFr: (v: string) => void;
  onEn: (v: string) => void;
  required?: boolean;
  maxLength: number;
  multiline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["fr", fr, onFr],
            ["en", en, onEn],
          ] as const
        ).map(([l, value, set]) => (
          <label key={l} className="block">
            <span className="mb-0.5 block text-xs font-medium text-slate-500">{t(l === "fr" ? "kds.langFr" : "kds.langEn")}</span>
            {multiline ? (
              <textarea
                lang={l}
                rows={2}
                maxLength={maxLength}
                value={value}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
              />
            ) : (
              <input
                lang={l}
                required={required}
                maxLength={maxLength}
                value={value}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Liste d'options bilingues (cuissons, accompagnements) : une ligne FR + EN par option. */
function LabelListEditor({
  label,
  values,
  onChange,
  presets = [],
}: {
  label: string;
  values: Label[];
  onChange: (v: Label[]) => void;
  presets?: Label[];
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const missingPresets = presets.filter((p) => !values.some((v) => v.fr.toLowerCase() === p.fr.toLowerCase()));
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_2.75rem] gap-2">
            <PairInput lang="fr" value={v.fr} onChange={(fr) => onChange(values.map((x, j) => (j === i ? { ...x, fr } : x)))} />
            <PairInput lang="en" value={v.en} onChange={(en) => onChange(values.map((x, j) => (j === i ? { ...x, en } : x)))} />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="flex min-h-12 items-center justify-center rounded-lg text-slate-400 hover:text-red-600"
              aria-label={t("dishForm.remove")}
            >
              <X size={18} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={values.length >= 12}
            onClick={() => onChange([...values, { fr: "", en: "" }])}
            className="flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-600 disabled:opacity-40"
          >
            <Plus size={15} /> {t("menuAdmin.add")}
          </button>
          {missingPresets.map((p) => (
            <button
              key={p.fr}
              type="button"
              onClick={() => onChange([...values, p])}
              className="min-h-10 rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              + {lang === "en" ? p.en : p.fr}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
