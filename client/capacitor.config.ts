import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

/**
 * Application Android THAONI APP (tablettes serveur / cuisine / caisse).
 *
 * L'application charge l'interface depuis le serveur RestoApp du restaurant
 * (CAP_SERVER_URL, ex. https://resto.example.com ou http://192.168.1.10:4000) : interface
 * et API partagent alors la même origine, condition pour les cookies de session
 * HttpOnly + SameSite=Strict. Une mise à jour de l'interface sur le serveur est
 * visible sur toutes les tablettes sans réinstaller l'APK.
 *
 *   CAP_SERVER_URL=https://resto.example.com npm run cap:build -w client
 */
const serverUrl = process.env.CAP_SERVER_URL?.trim().replace(/\/+$/, "");
if (!serverUrl) {
  console.warn("⚠ CAP_SERVER_URL non défini : l'APK affichera un écran de configuration. Ex. CAP_SERVER_URL=http://192.168.1.10:4000");
}

const config: CapacitorConfig = {
  appId: "com.restoapp.pos",
  appName: "THAONI APP",
  webDir: "dist",
  ...(serverUrl && {
    server: {
      url: serverUrl,
      // HTTP en clair autorisé seulement si l'adresse du serveur est en http:// (réseau local)
      cleartext: serverUrl.startsWith("http://"),
      androidScheme: "https",
    },
  }),
  android: {
    // Pas de contenu HTTP mélangé dans une page HTTPS
    allowMixedContent: false,
    // Débogage Chrome (chrome://inspect) uniquement pour les builds de développement
    webContentsDebuggingEnabled: process.env.CAP_DEBUG === "true",
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#0f172a",
    },
    Keyboard: {
      // Le contenu se redimensionne au-dessus du clavier virtuel (champs jamais masqués)
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
