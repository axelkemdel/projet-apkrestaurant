import { useEffect, useState } from "react";
import { CheckCircle2, Languages, Loader2, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { orderLang } from "../../lib/localize";
import { Modal } from "../Modal";
import { PrintableReceipt, Receipt } from "./Receipt";
import { api } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import type { Lang, Receipt as ReceiptData } from "../../types";

/** Aperçu du ticket après encaissement (ou réimpression), avec impression thermique / PDF. */
export function ReceiptModal({
  paymentId,
  autoPrint,
  onClose,
}: {
  paymentId: string | null;
  autoPrint?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Langue du ticket : par défaut celle du client (langue de prise de commande)
  const [receiptLang, setReceiptLang] = useState<Lang>("fr");

  useEffect(() => {
    setData(null);
    setError(null);
    if (!paymentId) return;
    api<ReceiptData>(`/checkout/receipt/${paymentId}`)
      .then((d) => {
        setReceiptLang(orderLang(d.language));
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [paymentId]);

  useEffect(() => {
    // Laisse le portail d'impression se monter avant d'ouvrir la boîte d'impression
    if (data && autoPrint) setTimeout(() => window.print(), 300);
  }, [data, autoPrint]);

  const settled = data?.totals.remainingAfter === 0;

  return (
    <>
      <Modal
        open={paymentId !== null}
        onClose={onClose}
        title={
          data ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600" />
              {settled ? t("cashier.billSettled") : t("receiptModal.recorded", { remaining: formatPrice(data.totals.remainingAfter) })}
            </span>
          ) : (
            t("receiptModal.title")
          )
        }
        footer={
          <div className="flex gap-2">
            <button onClick={onClose} className="min-h-12 flex-1 rounded-xl bg-slate-100 font-semibold hover:bg-slate-200">
              {t("common.close")}
            </button>
            <button
              disabled={!data}
              onClick={() => window.print()}
              className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white disabled:bg-slate-300"
            >
              <Printer size={18} /> {t("receiptModal.print")}
            </button>
          </div>
        }
      >
        {data && data.payment.mode === "CASH" && data.payment.changeReturned > 0 && (
          <div className="mb-4 rounded-xl bg-emerald-600 px-4 py-3 text-center text-white">
            <div className="text-xs font-semibold uppercase opacity-80">{t("pay.change")}</div>
            <div className="text-3xl font-black">{formatPrice(data.payment.changeReturned)}</div>
          </div>
        )}
        {data && (
          <div className="mb-3 flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-500">
              <Languages size={16} /> {t("receiptModal.language")}
            </span>
            <div className="flex rounded-lg bg-slate-100 p-0.5 font-semibold" role="group" aria-label={t("receiptModal.language")}>
              {(["fr", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setReceiptLang(l)}
                  aria-pressed={receiptLang === l}
                  className={`min-h-10 rounded-md px-3 ${receiptLang === l ? "bg-white shadow-sm" : "text-slate-500"}`}
                >
                  {t(l === "fr" ? "kds.langFr" : "kds.langEn")}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-xl bg-slate-100 p-3">
          <div className="mx-auto w-fit shadow-md">
            {data ? (
              <Receipt data={data} lang={receiptLang} />
            ) : error ? (
              <p className="p-6 text-red-600">{error}</p>
            ) : (
              <div className="flex h-40 w-72 items-center justify-center bg-white">
                <Loader2 className="animate-spin text-slate-400" />
              </div>
            )}
          </div>
        </div>
      </Modal>
      <PrintableReceipt data={paymentId ? data : null} lang={receiptLang} />
    </>
  );
}
