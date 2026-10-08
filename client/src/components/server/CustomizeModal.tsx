import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { formatPrice } from "../../lib/format";
import { itemDescription, itemName, pick, useLang } from "../../lib/localize";
import type { CartLineInput } from "../../store/cart";
import { QUICK_NOTES, type Extra, type Label, type MenuItem, type QuickNote } from "../../types";

export function CustomizeModal({
  item,
  onClose,
  onConfirm,
  money = formatPrice,
  maxQuantity = 50,
  showImage = false,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (line: CartLineInput) => void;
  /** Mise en forme des montants (le portail client affiche la devise complète, ex. « FCFA ») */
  money?: (amount: number) => string;
  maxQuantity?: number;
  /** Photo et description en tête (portail client) */
  showImage?: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [quantity, setQuantity] = useState(1);
  const [cooking, setCooking] = useState<Label | undefined>();
  const [side, setSide] = useState<Label | undefined>();
  const [extras, setExtras] = useState<Extra[]>([]);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [notes, setNotes] = useState("");

  // Réinitialise le formulaire à chaque ouverture, avec les premières options présélectionnées
  useEffect(() => {
    if (!item) return;
    setQuantity(1);
    const cookings = item.options?.cooking;
    setCooking(cookings?.find((c) => c.fr === "À point") ?? cookings?.[0]);
    setSide(item.options?.sides?.[0]);
    setExtras([]);
    setQuickNotes([]);
    setNotes("");
  }, [item]);

  const options = item?.options ?? {};
  const unit = (item?.price ?? 0) + extras.reduce((s, e) => s + e.price, 0);

  const toggleQuickNote = (code: QuickNote) =>
    setQuickNotes((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={
        <div>
          {item && itemName(item, lang)}
          <div className="text-sm font-normal text-slate-500">{item && money(item.price)}</div>
        </div>
      }
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-100">
            <button className="flex h-12 w-12 items-center justify-center" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={t("order.less")}>
              <Minus size={18} />
            </button>
            <span className="w-8 text-center text-lg font-bold">{quantity}</span>
            <button className="flex h-12 w-12 items-center justify-center" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} aria-label={t("order.more")}>
              <Plus size={18} />
            </button>
          </div>
          <button
            onClick={() => item && onConfirm({ item, quantity, cooking, side, extras, quickNotes, notes: notes.trim() || undefined })}
            className="min-h-12 flex-1 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600"
          >
            {t("order.addFor", { price: money(unit * quantity) })}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {showImage && item?.imageUrl && (
          <img src={item.imageUrl} alt="" className="-mx-5 -mt-4 aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
        )}
        {showImage && item && itemDescription(item, lang) && <p className="text-sm text-slate-600">{itemDescription(item, lang)}</p>}
        {options.cooking?.length ? (
          <ChoiceGroup label={t("order.cooking")} values={options.cooking} value={cooking} onChange={setCooking} />
        ) : null}
        {options.sides?.length ? <ChoiceGroup label={t("order.side")} values={options.sides} value={side} onChange={setSide} /> : null}
        {options.extras?.length ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-700">{t("order.extras")}</legend>
            <div className="space-y-2">
              {options.extras.map((e) => {
                const checked = extras.some((x) => x.fr === e.fr);
                return (
                  <label
                    key={e.fr}
                    className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border px-4 py-2 ${
                      checked ? "border-brand-500 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-500"
                        checked={checked}
                        onChange={() => setExtras((xs) => (checked ? xs.filter((x) => x.fr !== e.fr) : [...xs, e]))}
                      />
                      {pick(e, lang)}
                    </span>
                    <span className="text-sm text-slate-500">{e.price ? `+ ${money(e.price)}` : t("order.free")}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-700">{t("order.kitchenNotes")}</span>
          {/* Notes rapides codifiées : la cuisine les lit traduites dans sa langue */}
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_NOTES.map((code) => {
              const active = quickNotes.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleQuickNote(code)}
                  className={`min-h-10 rounded-full px-3 text-sm ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {t(`quickNotes.${code}`)}
                </button>
              );
            })}
          </div>
          <label htmlFor="notes" className="mb-1 block text-xs text-slate-500">
            {t("order.freeNoteHint")}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={t("order.notesPlaceholder")}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>
      </div>
    </Modal>
  );
}

function ChoiceGroup({ label, values, value, onChange }: { label: string; values: Label[]; value?: Label; onChange: (v: Label) => void }) {
  const lang = useLang();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v.fr}
            type="button"
            aria-pressed={value?.fr === v.fr}
            onClick={() => onChange(v)}
            className={`min-h-12 rounded-xl border px-4 text-sm font-medium ${
              value?.fr === v.fr ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            {pick(v, lang)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
