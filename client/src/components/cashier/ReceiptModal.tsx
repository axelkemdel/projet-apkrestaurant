import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Printer } from "lucide-react";
import { Modal } from "../Modal";
import { PrintableReceipt, Receipt } from "./Receipt";
import { api } from "../../lib/api";
import { formatPrice } from "../../lib/format";
import type { Receipt as ReceiptData } from "../../types";

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
  const [data, setData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!paymentId) return;
    api<ReceiptData>(`/checkout/receipt/${paymentId}`)
      .then(setData)
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
              {settled ? "Addition soldée" : `Versement enregistré — reste ${formatPrice(data.totals.remainingAfter)}`}
            </span>
          ) : (
            "Ticket de caisse"
          )
        }
        footer={
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold hover:bg-slate-200">
              Fermer
            </button>
            <button
              disabled={!data}
              onClick={() => window.print()}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:bg-slate-300"
            >
              <Printer size={18} /> Imprimer / PDF
            </button>
          </div>
        }
      >
        {data && data.payment.mode === "CASH" && data.payment.changeReturned > 0 && (
          <div className="mb-4 rounded-xl bg-emerald-600 px-4 py-3 text-center text-white">
            <div className="text-xs font-semibold uppercase opacity-80">Rendu monnaie</div>
            <div className="text-3xl font-black">{formatPrice(data.payment.changeReturned)}</div>
          </div>
        )}
        <div className="rounded-xl bg-slate-100 p-3">
          <div className="mx-auto w-fit shadow-md">
            {data ? (
              <Receipt data={data} />
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
      <PrintableReceipt data={paymentId ? data : null} />
    </>
  );
}
