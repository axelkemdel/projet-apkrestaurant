import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Shuffle,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, PinPad } from "../components/PinPad";
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

  const canSubmit = username.trim().length >= 3 && pin.length >= PIN_MIN_LENGTH && !loading;

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
    // Identité THAONI APP : photo de salle en fond, voile sombre légèrement flouté pour le contraste
    <div
      className="relative min-h-screen bg-slate-950 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/assets/arrierreplanresto.png)" }}
    >
      <div
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
        aria-hidden="true"
      />
      <LanguageSwitcher glass className="absolute right-3 top-3 z-10" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <img
              src="/assets/logoresto.png"
              alt="THAONI APP"
              className="mx-auto mb-4 w-32 drop-shadow-xl md:w-40"
            />
            <h1 className="flex items-center justify-center gap-2 text-xl font-bold text-white">
              <LockKeyhole size={20} className="text-orange-500" />{" "}
              {t("login.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-300">{t("login.subtitle")}</p>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-md md:p-8">
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
              <label
                htmlFor="login-username"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                {t("login.username")}
              </label>
              <div className="mb-5 flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/60 px-4 ring-orange-500 focus-within:ring-2">
                <UserRound size={18} className="shrink-0 text-slate-500" />
                <input
                  ref={usernameRef}
                  id="login-username"
                  name="username"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/\s/g, "").slice(0, 32))
                  }
                  // Entrée dans le champ : on passe au code PIN (le clavier physique alimente alors le pavé)
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    (e.preventDefault(), e.currentTarget.blur())
                  }
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
                  <KeyRound size={16} className="text-slate-500" />{" "}
                  {t("login.pin")}
                </span>
                <button
                  type="button"
                  onClick={toggleShuffle}
                  aria-pressed={shuffle}
                  title={t("login.shuffleHint")}
                  className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${
                    shuffle
                      ? "bg-orange-500/15 text-orange-400"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Shuffle size={14} /> {t("login.shuffle")}
                </button>
              </div>
              <PinPad
                value={pin}
                onChange={setPin}
                onSubmit={() => void submit()}
                canSubmit={canSubmit}
                maxLength={PIN_MAX_LENGTH}
                loading={loading}
                shuffle={shuffle}
                shuffleKey={shuffleKey}
                brand
              />
            </motion.form>

            <p
              className="mt-4 min-h-6 text-center text-sm font-medium text-red-400"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          </div>

          <div className="mt-5 space-y-1 text-center text-xs text-slate-300/80">
            <p className="flex items-center justify-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-500" />{" "}
              {t("login.secure")}
            </p>
            <p>{t("login.closedRegistration")}</p>
            <p>{t("login.forgot")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
