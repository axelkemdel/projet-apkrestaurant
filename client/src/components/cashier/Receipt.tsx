import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../lib/format";
import { discountReason, formatPercent, itemName, modifiersText, paymentLabel } from "../../lib/localize";
import type { Lang, Receipt as ReceiptData } from "../../types";

/**
 * Ticket de caisse au format imprimante thermique 80 mm (zone imprimable ~72 mm,
 * 42 à 48 caractères par ligne). Le même composant sert d'aperçu à l'écran et
 * de document imprimé / enregistré en PDF via la boîte d'impression du navigateur.
 */
export function Receipt({ data, lang }: { data: ReceiptData; lang: Lang }) {
  // Ticket rédigé dans la langue choisie (par défaut celle du client), indépendamment de l'écran
  const { t } = useTranslation("translation", { lng: lang });
  const amountFmt = new Intl.NumberFormat(lang === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 });
  const cur = data.restaurant.currency;
  const money = (n: number) => `${amountFmt.format(n)} ${cur}`;
  const r = data.restaurant;
  const settled = data.totals.remainingAfter === 0;

  return (
    <div className="receipt" lang={lang}>
      <header className="receipt-center">
        <div className="receipt-title">{r.name}</div>
        {r.address && <div>{r.address}</div>}
        {r.phone && <div>{t("receipt.phone", { phone: r.phone })}</div>}
        {(r.nif || r.rccm) && (
          <div>
            {r.nif && <>NIF : {r.nif}</>}
            {r.nif && r.rccm && " · "}
            {r.rccm && <>RCCM : {r.rccm}</>}
          </div>
        )}
      </header>

      <hr className="receipt-sep" />
      <Row left={t("receipt.number", { number: String(data.ticketNumber).padStart(6, "0") })} right={formatDateTime(data.createdAt, lang)} />
      <Row
        left={
          data.table !== null
            ? t("common.table", { number: data.table })
            : data.orderType === "DELIVERY"
              ? t("common.delivery")
              : t("common.takeaway")
        }
        right={t("receipt.tickets", { count: data.orderNumbers.length, numbers: data.orderNumbers.join(", #") })}
      />
      {data.servers.length > 0 && <Row left={t("receipt.server", { names: data.servers.join(", ") })} />}
      <Row left={t("receipt.cashier", { name: data.cashier })} />
      <hr className="receipt-sep" />

      <table className="receipt-lines">
        <tbody>
          {data.lines.map((l) => {
            const details = modifiersText(l.modifiers, lang);
            return (
              <tr key={l.id}>
                <td className="receipt-qty">{l.quantity}×</td>
                <td>
                  {itemName(l, lang)}
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
      <Row left={t("receipt.total")} right={money(data.totals.total)} strong />
      {data.discounts.map((d, i) => (
        <Row
          key={i}
          left={`${t("cashier.discount")}${d.percent !== null ? ` ${formatPercent(d.percent, lang)}` : ""} (${discountReason(d.reason, lang)})`}
          right={`- ${money(d.amount)}`}
        />
      ))}
      {data.totals.discounted > 0 && <Row left={t("receipt.net")} right={money(data.totals.total - data.totals.discounted)} strong />}
      {data.totals.paidBefore > 0 && <Row left={t("receipt.paidBefore")} right={`- ${money(data.totals.paidBefore)}`} />}

      <hr className="receipt-sep receipt-dashed" />
      <div className="receipt-subtitle">
        {t("receipt.payment")}
        {data.payment.label ? ` — ${paymentLabel(data.payment.label, t, lang)}` : ""}
      </div>
      {data.paidLines.length > 0 &&
        data.paidLines.map((l, i) => <Row key={i} left={`  ${l.quantity}× ${itemName(l, lang)}`} right={amountFmt.format(l.amount)} small />)}
      <Row left={t(`paymentModes.${data.payment.mode}`)} right={money(data.payment.amount)} strong />
      {data.payment.reference && <Row left={t("receipt.reference")} right={data.payment.reference} small />}
      {data.payment.mode === "CASH" && (
        <>
          <Row left={t("receipt.cashReceived")} right={money(data.payment.amountReceived)} />
          <Row left={t("pay.change")} right={money(data.payment.changeReturned)} strong />
        </>
      )}

      {data.history.length > 1 && (
        <>
          <hr className="receipt-sep receipt-dashed" />
          <div className="receipt-subtitle">{t("receipt.history")}</div>
          {data.history.map((h) => (
            <Row
              key={h.number}
              left={`#${h.number} ${t(`paymentModes.${h.mode}`)}${h.label ? ` (${paymentLabel(h.label, t, lang)})` : ""}`}
              right={amountFmt.format(h.amount)}
              small
            />
          ))}
        </>
      )}

      <hr className="receipt-sep" />
      {settled ? (
        <div className="receipt-center receipt-title">{t("receipt.settled")}</div>
      ) : (
        <Row left={t("receipt.remaining")} right={money(data.totals.remainingAfter)} strong />
      )}
      <hr className="receipt-sep" />
      <footer className="receipt-center">
        <div>{lang === "en" ? r.footerEn || r.footer : r.footer}</div>
        <div className="receipt-small">{t("receipt.amountsIn", { currency: cur })}</div>
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
export function PrintableReceipt({ data, lang }: { data: ReceiptData | null; lang: Lang }) {
  if (!data) return null;
  return createPortal(
    <div id="print-area">
      <Receipt data={data} lang={lang} />
    </div>,
    document.body,
  );
}
