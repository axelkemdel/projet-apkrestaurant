import { useEffect } from "react";
import i18n from "../i18n";
import { toast } from "../components/Toasts";
import { getSocket } from "./socket";
import { playNewOrderChime, unlockAudio } from "./sound";
import type { Order, StaffAlert } from "../types";

/**
 * Alertes venant des clients (QR code) sur les tablettes du personnel : appel d'un
 * serveur, demande d'addition, commande passée par le client. Notification visuelle,
 * sonore (si l'audio a été débloqué par un geste) et vibration.
 */
export function useStaffAlerts(kinds: { call?: boolean; bill?: boolean; qrOrders?: boolean }) {
  const { call = false, bill = false, qrOrders = false } = kinds;

  useEffect(() => {
    // Les navigateurs n'autorisent le son qu'après une interaction avec la page
    const unlock = () => void unlockAudio().catch(() => undefined);
    window.addEventListener("pointerdown", unlock, { once: true });

    const ring = () => {
      playNewOrderChime();
      navigator.vibrate?.([200, 80, 200]);
    };
    const onCall = (a: StaffAlert) => {
      toast.info(i18n.t("alerts.call", { number: a.number }));
      ring();
    };
    const onBill = (a: StaffAlert) => {
      toast.info(i18n.t("alerts.bill", { number: a.number }));
      ring();
    };
    const onOrder = (o: Order) => {
      if (o.source !== "CUSTOMER" || !o.table) return;
      toast.info(i18n.t("alerts.newQrOrder", { number: o.table.number, order: o.number }));
    };

    const s = getSocket();
    if (call) s.on("server_alert", onCall);
    if (bill) s.on("request_bill", onBill);
    if (qrOrders) s.on("new_order", onOrder);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      s.off("server_alert", onCall);
      s.off("request_bill", onBill);
      s.off("new_order", onOrder);
    };
  }, [call, bill, qrOrders]);
}
