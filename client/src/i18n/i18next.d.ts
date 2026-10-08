import "i18next";
import type { fr } from "./fr";

// Clés de traduction typées : une clé inexistante est une erreur de compilation
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof fr };
  }
}
