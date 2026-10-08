import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Modal } from "../Modal";
import { formatPrice } from "../../lib/format";
import type { CartLineInput } from "../../store/cart";
import type { Extra, MenuItem } from "../../types";

const QUICK_NOTES = ["Sans oignon", "Sans piment", "Bien pimenté", "Sauce à part", "Sans sel", "Allergie arachide"];

export function CustomizeModal({
  item,
  onClose,
  onConfirm,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (line: CartLineInput) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [cooking, setCooking] = useState<string | undefined>();
  const [side, setSide] = useState<string | undefined>();
  const [extras, setExtras] = useState<Extra[]>([]);
  const [notes, setNotes] = useState("");

  // Réinitialise le formulaire à chaque ouverture, avec les premières options présélectionnées
  useEffect(() => {
    if (!item) return;
    setQuantity(1);
    const cookings = item.options?.cooking;
    setCooking(cookings?.find((c) => c === "À point") ?? cookings?.[0]);
    setSide(item.options?.sides?.[0]);
    setExtras([]);
    setNotes("");
  }, [item]);

  const options = item?.options ?? {};
  const unit = (item?.price ?? 0) + extras.reduce((s, e) => s + e.price, 0);

  function toggleNote(n: string) {
    setNotes((cur) => {
      const parts = cur.split(",").map((p) => p.trim()).filter(Boolean);
      return (parts.includes(n) ? parts.filter((p) => p !== n) : [...parts, n]).join(", ");
    });
  }

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={
        <div>
          {item?.name}
          <div className="text-sm font-normal text-slate-500">{item && formatPrice(item.price)}</div>
        </div>
      }
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-slate-100">
            <button className="p-3" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Moins">
              <Minus size={18} />
            </button>
            <span className="w-8 text-center text-lg font-bold">{quantity}</span>
            <button className="p-3" onClick={() => setQuantity((q) => q + 1)} aria-label="Plus">
              <Plus size={18} />
            </button>
          </div>
          <button
            onClick={() => item && onConfirm({ item, quantity, cooking, side, extras, notes: notes.trim() || undefined })}
            className="flex-1 rounded-xl bg-brand-500 py-3.5 font-semibold text-white hover:bg-brand-600"
          >
            Ajouter · {formatPrice(unit * quantity)}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {options.cooking?.length ? (
          <ChoiceGroup label="Cuisson" values={options.cooking} value={cooking} onChange={setCooking} />
        ) : null}
        {options.sides?.length ? (
          <ChoiceGroup label="Accompagnement" values={options.sides} value={side} onChange={setSide} />
        ) : null}
        {options.extras?.length ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-700">Suppléments</legend>
            <div className="space-y-2">
              {options.extras.map((e) => {
                const checked = extras.some((x) => x.name === e.name);
                return (
                  <label
                    key={e.name}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 ${
                      checked ? "border-brand-500 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-500"
                        checked={checked}
                        onChange={() => setExtras((xs) => (checked ? xs.filter((x) => x.name !== e.name) : [...xs, e]))}
                      />
                      {e.name}
                    </span>
                    <span className="text-sm text-slate-500">{e.price ? `+ ${formatPrice(e.price)}` : "Offert"}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div>
          <label htmlFor="notes" className="mb-2 block text-sm font-semibold text-slate-700">
            Note pour la cuisine
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_NOTES.map((n) => {
              const active = notes.split(",").map((p) => p.trim()).includes(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleNote(n)}
                  className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Ex : sans oignon, bien cuit…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
          />
        </div>
      </div>
    </Modal>
  );
}

function ChoiceGroup({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-slate-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
              value === v ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
