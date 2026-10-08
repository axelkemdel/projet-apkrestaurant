import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { fr } from "./fr";
import { en } from "./en";
import type { Lang } from "../types";

export const LANGS: readonly Lang[] = ["fr", "en"];
const STORAGE_KEY = "restoapp-lang";

/**
 * Langue par défaut du restaurant (VITE_DEFAULT_LANG, « fr » sinon). On ne se fie pas
 * à la langue du navigateur : beaucoup de tablettes sont réglées en anglais par défaut.
 */
const DEFAULT_LANG: Lang = import.meta.env.VITE_DEFAULT_LANG === "en" ? "en" : "fr";

/** Langue de l'appareil : choix mémorisé sur cet appareil, sinon langue par défaut du restaurant. */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT_LANG;
}

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: initialLang(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false }, // React échappe déjà le contenu
  returnNull: false,
});

function applyLang(lng: string) {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* préférence non mémorisée */
  }
}
applyLang(i18n.language);
i18n.on("languageChanged", applyLang);

export function currentLang(): Lang {
  return i18n.language === "en" ? "en" : "fr";
}

export default i18n;
