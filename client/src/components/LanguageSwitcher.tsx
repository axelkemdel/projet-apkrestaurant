import { useTranslation } from "react-i18next";
import { LANGS } from "../i18n";
import { getSocket } from "../lib/socket";
import type { Lang } from "../types";

/**
 * Commutateur FR / EN, présent sur tous les écrans. Le choix est mémorisé par
 * appareil ; le serveur répond ensuite (erreurs, accusés temps réel) dans cette langue.
 */
export function LanguageSwitcher({ dark = false, glass = false, className = "" }: { dark?: boolean; glass?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Lang;

  function change(lang: Lang) {
    if (lang === current) return;
    void i18n.changeLanguage(lang);
    getSocket().emit("set_lang", lang);
  }

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={`flex shrink-0 rounded-lg p-0.5 text-xs font-bold ${
        glass ? "border border-white/15 bg-slate-950/40 shadow-lg backdrop-blur-md" : dark ? "bg-slate-800" : "bg-slate-100"
      } ${className}`}
    >
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => change(lang)}
          aria-pressed={current === lang}
          title={t("common.switchTo", { lang: lang === "fr" ? "Français" : "English" })}
          className={`flex h-10 min-w-9 items-center justify-center rounded-md px-1.5 uppercase ${
            current === lang
              ? dark || glass
                ? "bg-slate-100 text-slate-900"
                : "bg-white text-slate-900 shadow-sm"
              : glass
                ? "text-slate-200 hover:text-white"
                : dark
                  ? "text-slate-400"
                  : "text-slate-500"
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
