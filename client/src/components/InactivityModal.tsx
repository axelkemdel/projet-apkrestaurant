import { motion } from "framer-motion";
import { LogOut, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandDialog, primaryButton, secondaryButton } from "./BrandDialog";

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Avertissement avant déconnexion pour inactivité : compte à rebours (anneau qui se vide),
 * « Rester connecté » (relance le délai) ou « Se déconnecter maintenant ».
 */
export function InactivityModal({
  open,
  secondsLeft,
  totalSeconds,
  onStay,
  onLogout,
}: {
  open: boolean;
  secondsLeft: number;
  totalSeconds: number;
  onStay: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const progress = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const urgent = secondsLeft <= 10;

  return (
    <BrandDialog open={open} role="alertdialog" labelledBy="inactivity-title" describedBy="inactivity-text" onEscape={onStay}>
      <div className="relative mx-auto mb-4 h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="6" className="stroke-slate-800" />
          <motion.circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={false}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
            transition={{ duration: 0.9, ease: "linear" }}
            className={urgent ? "stroke-red-500" : "stroke-[#f97316]"}
          />
        </svg>
        <motion.span
          key={secondsLeft}
          initial={{ scale: 1.25, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`absolute inset-0 flex items-center justify-center text-4xl font-black tabular-nums ${urgent ? "text-red-400" : "text-white"}`}
          aria-hidden="true"
        >
          {secondsLeft}
        </motion.span>
      </div>

      <h2 id="inactivity-title" className="text-lg font-bold">
        {t("session.warningTitle")}
      </h2>
      {/* Annonce vocale à chaque dizaine de secondes (pas à chaque seconde) */}
      <p id="inactivity-text" className="mt-1 text-sm text-slate-300" aria-live={secondsLeft % 10 === 0 ? "assertive" : "off"}>
        {t("session.warningText", { count: secondsLeft })}
      </p>

      <div className="mt-6 space-y-2">
        <button type="button" data-autofocus onClick={onStay} className={primaryButton}>
          <ShieldCheck size={18} /> {t("session.stay")}
        </button>
        <button type="button" onClick={onLogout} className={secondaryButton}>
          <LogOut size={18} /> {t("session.logoutNow")}
        </button>
      </div>
    </BrandDialog>
  );
}
