import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, LockKeyhole, ShieldCheck, Shuffle, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { PinPad } from "../components/PinPad";
import { loginWithCredentials } from "../lib/session";

const SHUFFLE_PREF = "restoapp-keypad-shuffle";

function readShufflePref(): boolean {
  try {
    return localStorage.getItem(SHUFFLE_PREF) !== "off";
  } catch {
    return true;
  }
}

/**
 * Connexion « Zero-Trust ».
 *  - Aucune liste de comptes : l'employé saisit son identifiant puis son code PIN ;
 *  - pavé numérique mélangé par défaut (nouvelle disposition après chaque échec) ;
 *  - message d'erreur unique renvoyé par le serveur (« Identifiants invalides »), qui
 *    ne révèle jamais si l'identifiant existe ; blocage après trop d'essais ;
 *  - aucune inscription : les comptes sont créés par le gérant.
 * Après connexion, l'application redirige vers l'écran du rôle (voir App.tsx).
 */
export function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shuffle, setShuffle] = useState(readShufflePref);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [shake, setShake] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => usernameRef.current?.focus(), []);

  const canSubmit = username.trim().length >= 3 && pin.length >= 4 && !loading;

  async function submit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await loginWithCredentials(username.trim().toLowerCase(), pin);
    } catch (e) {
      setError((e as Error).message);
      setPin("");
      setShake((n) => n + 1);
      // Nouvelle disposition des touches après chaque échec
      setShuffleKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  function toggleShuffle() {
    setShuffle((on) => {
      try {
        localStorage.setItem(SHUFFLE_PREF, on ? "off" : "on");
      } catch {
        /* préférence non mémorisée */
      }
      return !on;
    });
    setShuffleKey((k) => k + 1);
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-y-auto bg-slate-950 px-4 py-16">
      <LanguageSwitcher dark className="absolute right-3 top-3" />
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="rounded-xl bg-brand-500 px-3 py-1.5 text-2xl font-black text-white">RestoApp</span>
          <h1 className="mt-5 flex items-center justify-center gap-2 text-xl font-bold text-white">
            <LockKeyhole size={20} className="text-brand-500" /> {t("login.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{t("login.subtitle")}</p>
        </div>

        <motion.form
          key={shake}
          animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
          transition={{ duration: 0.35 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          autoComplete="off"
        >
          <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-slate-300">
            {t("login.username")}
          </label>
          <div className="mb-5 flex items-center gap-2 rounded-2xl bg-slate-800 px-4 ring-brand-500 focus-within:ring-2">
            <UserRound size={18} className="shrink-0 text-slate-500" />
            <input
              ref={usernameRef}
              id="login-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").slice(0, 32))}
              // Entrée dans le champ : on passe au code PIN (le clavier physique alimente alors le pavé)
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder={t("login.usernamePlaceholder")}
              className="min-h-14 min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-slate-600"
            />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <KeyRound size={16} className="text-slate-500" /> {t("login.pin")}
            </span>
            <button
              type="button"
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              title={t("login.shuffleHint")}
              className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${
                shuffle ? "bg-brand-500/15 text-brand-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Shuffle size={14} /> {t("login.shuffle")}
            </button>
          </div>
          <PinPad value={pin} onChange={setPin} onSubmit={() => void submit()} canSubmit={canSubmit} loading={loading} shuffle={shuffle} shuffleKey={shuffleKey} />
        </motion.form>

        <p className="mt-4 min-h-6 text-center text-sm font-medium text-red-400" role="alert" aria-live="assertive">
          {error}
        </p>

        <div className="mt-4 space-y-1 text-center text-xs text-slate-500">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" /> {t("login.secure")}
          </p>
          <p>{t("login.closedRegistration")}</p>
          <p>{t("login.forgot")}</p>
        </div>
      </div>
    </div>
  );
}
