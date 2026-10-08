import { createPortal } from "react-dom";
import { formatDateTime, paymentModeLabel } from "../../lib/format";
import { modifiersText } from "../OrderItemLine";
import type { Receipt as ReceiptData } from "../../types";

const amountFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Ticket de caisse au format imprimante thermique 80 mm (zone imprimable ~72 mm,
 * 42 à 48 caractères par ligne). Le même composant sert d'aperçu à l'écran et
 * de document imprimé / enregistré en PDF via la boîte d'impression du navigateur.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const cur = data.restaurant.currency;
  const money = (n: number) => `${amountFmt.format(n)} ${cur}`;
  const r = data.restaurant;
  const settled = data.totals.remainingAfter === 0;

  return (
    <div className="receipt">
      <header className="receipt-center">
        <div className="receipt-title">{r.name}</div>
        {r.address && <div>{r.address}</div>}
        {r.phone && <div>Tél : {r.phone}</div>}
        {(r.nif || r.rccm) && (
          <div>
            {r.nif && <>NIF : {r.nif}</>}
            {r.nif && r.rccm && " · "}
            {r.rccm && <>RCCM : {r.rccm}</>}
          </div>
        )}
      </header>

      <hr className="receipt-sep" />
      <Row left={`Ticket N° ${String(data.ticketNumber).padStart(6, "0")}`} right={formatDateTime(data.createdAt)} />
      <Row
        left={data.table !== null ? `Table ${data.table}` : data.orderType === "DELIVERY" ? "Livraison" : "À emporter"}
        right={`Bon${data.orderNumbers.length > 1 ? "s" : ""} #${data.orderNumbers.join(", #")}`}
      />
      <Row left={`Serveur : ${data.servers.join(", ")}`} />
      <Row left={`Caissier : ${data.cashier}`} />
      <hr className="receipt-sep" />

      <table className="receipt-lines">
        <tbody>
          {data.lines.map((l) => {
            const details = modifiersText(l.modifiers);
            return (
              <tr key={l.id}>
                <td className="receipt-qty">{l.quantity}×</td>
                <td>
                  {l.name}
                  {details && <div className="receipt-small">{details}</div>}
                  {l.quantity > 1 && <div className="receipt-small">@ {amountFmt.format(l.unitPrice)}</div>}
                </td>
                <td className="receipt-amount">{amountFmt.format(l.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <hr className="receipt-sep" />
      <Row left="TOTAL" right={money(data.totals.total)} strong />
      {data.totals.paidBefore > 0 && <Row left="Déjà réglé" right={`- ${money(data.totals.paidBefore)}`} />}

      <hr className="receipt-sep receipt-dashed" />
      <div className="receipt-subtitle">Règlement{data.payment.label ? ` — ${data.payment.label}` : ""}</div>
      {data.paidLines.length > 0 &&
        data.paidLines.map((l, i) => <Row key={i} left={`  ${l.quantity}× ${l.name}`} right={amountFmt.format(l.amount)} small />)}
      <Row left={paymentModeLabel[data.payment.mode]} right={money(data.payment.amount)} strong />
      {data.payment.reference && <Row left="Réf. transaction" right={data.payment.reference} small />}
      {data.payment.mode === "CASH" && (
        <>
          <Row left="Espèces reçues" right={money(data.payment.amountReceived)} />
          <Row left="Rendu monnaie" right={money(data.payment.changeReturned)} strong />
        </>
      )}

      {data.history.length > 1 && (
        <>
          <hr className="receipt-sep receipt-dashed" />
          <div className="receipt-subtitle">Versements sur cette addition</div>
          {data.history.map((h) => (
            <Row
              key={h.number}
              left={`#${h.number} ${paymentModeLabel[h.mode]}${h.label ? ` (${h.label})` : ""}`}
              right={amountFmt.format(h.amount)}
              small
            />
          ))}
        </>
      )}

      <hr className="receipt-sep" />
      {settled ? (
        <div className="receipt-center receipt-title">*** ADDITION SOLDÉE ***</div>
      ) : (
        <Row left="RESTE À PAYER" right={money(data.totals.remainingAfter)} strong />
      )}
      <hr className="receipt-sep" />
      <footer className="receipt-center">
        <div>{r.footer}</div>
        <div className="receipt-small">Montants en {cur}</div>
      </footer>
    </div>
  );
}

function Row({ left, right, strong, small }: { left: string; right?: string; strong?: boolean; small?: boolean }) {
  return (
    <div className={`receipt-row${strong ? " receipt-strong" : ""}${small ? " receipt-small" : ""}`}>
      <span>{left}</span>
      {right !== undefined && <span className="receipt-amount">{right}</span>}
    </div>
  );
}

/**
 * Copie du ticket rendue hors de l'application, seule visible à l'impression
 * (voir `@media print` dans index.css).
 */
export function PrintableReceipt({ data }: { data: ReceiptData | null }) {
  if (!data) return null;
  return createPortal(
    <div id="print-area">
      <Receipt data={data} />
    </div>,
    document.body,
  );
}
