import { useState } from "react";
import { Check, Delete, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Pavé de saisie du code PIN (4 à 6 chiffres), validé par la touche ✓.
 * Pas de validation automatique au 4e chiffre : elle rendrait impossibles les PIN plus longs.
 */
export function PinPad({ onSubmit, loading }: { onSubmit: (pin: string) => Promise<boolean | void>; loading: boolean }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");

  async function submit() {
    if (pin.length < 4 || loading) return;
    const ok = await onSubmit(pin);
    if (ok === false) setPin("");
  }

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-6 flex justify-center gap-3" aria-live="polite" aria-label={t("pin.digits", { count: pin.length })}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-brand-500" : "bg-slate-700"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => setPin((p) => (p.length < 6 ? p + d : p))}>
            {d}
          </Key>
        ))}
        <Key onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t("pin.erase")}>
          <Delete />
        </Key>
        <Key onClick={() => setPin((p) => (p.length < 6 ? p + "0" : p))}>0</Key>
        <Key
          onClick={() => void submit()}
          disabled={pin.length < 4 || loading}
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
