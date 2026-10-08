import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Check, Delete, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const ORDERED = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

/** Mélange de Fisher-Yates alimenté par le générateur cryptographique du navigateur. */
function shuffled(digits: string[]): string[] {
  const out = [...digits];
  const random = new Uint32Array(out.length);
  crypto.getRandomValues(random);
  for (let i = out.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pavé de saisie du code PIN (4 à 6 chiffres), contrôlé par le parent.
 *  - `shuffle` : touches disposées au hasard (anti « shoulder surfing ») ; nouvelle
 *    disposition à chaque changement de `shuffleKey` (ex. après un échec) ;
 *  - chiffres jamais affichés (points), validation par la touche ✓ ou Entrée ;
 *  - clavier physique accepté quand aucun champ texte n'a le focus.
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  canSubmit = value.length >= 4,
  loading = false,
  shuffle = false,
  shuffleKey = 0,
  maxLength = 6,
}: {
  value: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  canSubmit?: boolean;
  loading?: boolean;
  shuffle?: boolean;
  shuffleKey?: number;
  maxLength?: number;
}) {
  const { t } = useTranslation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const digits = useMemo(() => (shuffle ? shuffled(ORDERED) : ORDERED), [shuffle, shuffleKey]);
  const ready = canSubmit && !loading;

  // Clavier physique (tablette avec clavier, poste de caisse)
  const latest = useRef({ value, onChange, onSubmit, ready, maxLength });
  latest.current = { value, onChange, onSubmit, ready, maxLength };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const s = latest.current;
      if (/^\d$/.test(e.key)) {
        if (s.value.length < s.maxLength) s.onChange(s.value + e.key);
        e.preventDefault();
      } else if (e.key === "Backspace") {
        s.onChange(s.value.slice(0, -1));
        e.preventDefault();
      } else if (e.key === "Enter" && s.ready) {
        s.onSubmit();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const press = (d: string) => value.length < maxLength && onChange(value + d);

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-5 flex justify-center gap-3" aria-live="polite" aria-label={t("pin.digits", { count: value.length })}>
        {Array.from({ length: Math.max(4, value.length) }, (_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{ scale: i < value.length ? 1.15 : 1 }}
            className={`h-4 w-4 rounded-full ${i < value.length ? "bg-brand-500" : "bg-slate-700"}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.slice(0, 9).map((d) => (
          <Key key={`${shuffleKey}-${d}`} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <Key onClick={() => onChange(value.slice(0, -1))} aria-label={t("pin.erase")}>
          <Delete />
        </Key>
        <Key key={`${shuffleKey}-${digits[9]}`} onClick={() => press(digits[9])}>
          {digits[9]}
        </Key>
        <Key
          onClick={onSubmit}
          disabled={!ready}
          aria-label={t("pin.submit")}
          className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-800 disabled:text-slate-600"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Check />}
        </Key>
      </div>
    </div>
  );
}

function Key({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-16 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-semibold text-white active:scale-95 ${className}`}
    />
  );
}
