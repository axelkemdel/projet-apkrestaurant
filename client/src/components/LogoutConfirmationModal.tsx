import { Loader2, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandDialog, primaryButton, secondaryButton } from "./BrandDialog";

/** Confirmation avant déconnexion manuelle (évite les déconnexions accidentelles sur tablette). */
export function LogoutConfirmationModal({
  open,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BrandDialog open={open} labelledBy="logout-title" describedBy="logout-text" onEscape={busy ? undefined : onCancel}>
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15 text-[#f97316]">
        <LogOut size={26} />
      </span>
      <h2 id="logout-title" className="text-lg font-bold">
        {t("session.confirmTitle")}
      </h2>
      <p id="logout-text" className="mt-1 text-sm text-slate-300">
        {t("session.confirmText")}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button type="button" data-autofocus onClick={onCancel} disabled={busy} className={secondaryButton}>
          {t("session.cancel")}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={primaryButton}>
          {busy && <Loader2 size={18} className="animate-spin" />}
          {t("session.confirm")}
        </button>
      </div>
    </BrandDialog>
  );
}
