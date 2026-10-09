import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useAuth } from "../store/auth";
import { loginWithCredentials, logout } from "../lib/session";
import { PinPad } from "./PinPad";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

/**
 * Écran verrouillé à la demande (cadenas de l'en-tête) : la session serveur est fermée,
 * l'écran reste occulté et le PIN est redemandé. L'inactivité, elle, mène à une
 * déconnexion complète après avertissement (voir useAutoLogout / InactivityModal).
 */
export function IdleLock() {
  const user = useAuth((s) => s.user);
  const locked = useAuth((s) => s.locked);
  return <AnimatePresence>{locked && user && <LockScreen name={user.name} username={user.username} />}</AnimatePresence>;
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
