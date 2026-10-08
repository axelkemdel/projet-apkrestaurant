import { Loader2, Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { itemName, modifiersText, quickNotesText, useLang } from "../../lib/localize";
import { cartTotal, lineUnitPrice } from "../../store/cart";
import { useGuestCart } from "../../store/guestCart";

/** Panier du client (tiroir) : quantités, note pour la cuisine, total et envoi. */
export function GuestCartSheet({
  open,
  onClose,
  onSend,
  sending,
  money,
}: {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
  money: (n: number) => string;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { lines, note, setQuantity, setNote } = useGuestCart();
  const total = cartTotal(lines);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("portal.cart")}
      footer={
        lines.length > 0 && (
          <div>
            <p className="mb-2 text-center text-xs text-slate-500">{t("portal.sendHint")}</p>
            <button
              onClick={onSend}
              disabled={sending}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 text-base font-bold text-white shadow-lg shadow-brand-500/30 hover:bg-brand-600 disabled:opacity-60"
            >
              {sending && <Loader2 size={20} className="animate-spin" />}
              {t("portal.send", { price: money(total) })}
            </button>
          </div>
        )
      }
    >
      {lines.length === 0 ? (
        <div className="py-10 text-center">
          <ShoppingBasket className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 font-semibold text-slate-700">{t("portal.emptyCart")}</p>
          <p className="text-sm text-slate-500">{t("portal.emptyCartHint")}</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => {
              const details = [
                modifiersText({ cooking: l.cooking, side: l.side, extras: l.extras }, lang),
                quickNotesText(l.quickNotes, t, lang),
                l.notes,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={l.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{itemName(l.item, lang)}</div>
                    {details && <div className="text-xs text-slate-500">{details}</div>}
                    <div className="mt-0.5 text-sm font-semibold text-brand-600">{money(lineUnitPrice(l) * l.quantity)}</div>
                  </div>
                  <div className="flex items-center rounded-xl bg-slate-100">
                    <button
                      onClick={() => setQuantity(l.key, l.quantity - 1)}
                      className="flex h-11 w-11 items-center justify-center"
                      aria-label={l.quantity === 1 ? t("portal.remove") : t("order.less")}
                    >
                      {l.quantity === 1 ? <Trash2 size={16} className="text-red-500" /> : <Minus size={16} />}
                    </button>
                    <span className="w-6 text-center font-bold tabular-nums">{l.quantity}</span>
                    <button
                      onClick={() => setQuantity(l.key, l.quantity + 1)}
                      disabled={l.quantity >= 20}
                      className="flex h-11 w-11 items-center justify-center disabled:opacity-30"
                      aria-label={t("order.more")}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <label htmlFor="guest-note" className="mt-3 block text-sm font-medium text-slate-700">
            {t("portal.orderNote")}
          </label>
          <textarea
            id="guest-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={t("portal.orderNotePlaceholder")}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
          />
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
            <span className="font-semibold text-slate-600">{t("order.orderTotal")}</span>
            <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
          </div>
        </>
      )}
    </Modal>
  );
}
