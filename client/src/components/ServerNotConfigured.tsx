import { ServerCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * APK compilé sans adresse de serveur (CAP_SERVER_URL) : l'interface embarquée ne peut
 * pas joindre l'API. Explique comment recompiler plutôt qu'un écran de connexion inutilisable.
 */
export function ServerNotConfigured() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
      <LanguageSwitcher dark className="absolute right-3 top-3" />
      <ServerCog size={40} className="text-brand-500" />
      <h1 className="mt-4 text-xl font-bold">{t("native.notConfiguredTitle")}</h1>
      <p className="mt-2 max-w-md text-slate-400">{t("native.notConfiguredText")}</p>
      <code className="mt-4 rounded-lg bg-slate-800 px-3 py-2 text-sm text-brand-300">CAP_SERVER_URL=http://192.168.1.10:4000 npm run cap:sync</code>
    </div>
  );
}
