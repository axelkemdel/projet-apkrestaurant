import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useAuth } from "../store/auth";
import { IDLE_LOCK_MINUTES, lockSession, loginWithCredentials, logout } from "../lib/session";
import { PinPad } from "./PinPad";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const WARNING_MS = 30_000;

/**
 * Verrouillage automatique de l'appareil après inactivité. L'écran reste
 * occulté et la session serveur est fermée : il faut ressaisir son PIN.
 */
export function IdleLock() {
  const user = useAuth((s) => s.user);
  const locked = useAuth((s) => s.locked);
  const minutes = user ? IDLE_LOCK_MINUTES[user.role] : null;
  const { t } = useTranslation();
  const lastActivity = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!user || locked || !minutes) return;
    lastActivity.current = Date.now();
    const onActivity = () => {
      lastActivity.current = Date.now();
      setSecondsLeft(null);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      const left = minutes * 60_000 - (Date.now() - lastActivity.current);
      if (left <= 0) {
        setSecondsLeft(null);
        void lockSession();
      } else {
        setSecondsLeft(left <= WARNING_MS ? Math.ceil(left / 1000) : null);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [user, locked, minutes]);

  return (
    <>
      <AnimatePresence>
        {secondsLeft !== null && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed inset-x-0 top-2 z-[70] mx-auto w-fit rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg"
            role="status"
          >
            {t("lock.warning", { seconds: secondsLeft })}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{locked && user && <LockScreen name={user.name} username={user.username} />}</AnimatePresence>
    </>
  );
}

/** Reprise après verrouillage : la session a été révoquée, une nouvelle connexion (même employé) est exigée. */
function LockScreen({ name, username }: { name: string; username: string }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shuffleKey, setShuffleKey] = useState(0);

  async function unlock() {
    setLoading(true);
    setError(null);
    try {
      await loginWithCredentials(username, pin);
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setShuffleKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={t("lock.title")}
    >
      <LanguageSwitcher dark className="absolute right-3 top-3" />
      <div className="w-full max-w-sm py-6 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-brand-500">
          <Lock />
        </span>
        <h2 className="text-xl font-bold text-white">{t("lock.title")}</h2>
        <p className="mb-6 mt-1 text-slate-400">{t("lock.prompt", { name })}</p>
        <PinPad value={pin} onChange={setPin} onSubmit={() => void unlock()} loading={loading} shuffle shuffleKey={shuffleKey} />
        {error && (
          <p className="mt-4 text-sm font-medium text-red-400" role="alert">
            {error}
          </p>
        )}
        <button onClick={() => void logout()} className="mt-4 min-h-12 px-4 text-sm font-medium text-slate-400 hover:text-white">
          {t("lock.switchUser")}
        </button>
      </div>
    </motion.div>
  );
}
