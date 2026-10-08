import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";
import { resolveServerUrl } from "./scripts/server-url.cjs";

/**
 * Application Android THAONI APP (tablettes serveur / cuisine / caisse).
 *
 * L'application charge l'interface depuis le serveur THAONI APP : interface et API
 * partagent alors la même origine, condition pour les cookies de session HttpOnly +
 * SameSite=Strict, et une mise à jour de l'interface sur le serveur arrive sur toutes
 * les tablettes sans réinstaller l'APK.
 *
 * Adresse (scripts/server-url.cjs) : CAP_SERVER_URL ou VITE_SERVER_URL si définie, sinon
 * l'adresse publique du Codespace (port 5173), sinon l'IP locale de la machine.
 *
 *   CAP_SERVER_URL=https://resto.example.com npm run cap:sync -w client
 */
const server = resolveServerUrl();
if (server) {
  console.log(`ℹ Serveur de l'application : ${server.url} (${server.source})`);
} else {
  console.warn("⚠ Aucune adresse de serveur : l'APK affichera « Serveur non configuré ». Ex. CAP_SERVER_URL=http://192.168.1.10:4000");
}

const config: CapacitorConfig = {
  appId: "com.restoapp.pos",
  appName: "THAONI APP",
  webDir: "dist",
  server: {
    androidScheme: "https",
    ...(server && {
      url: server.url,
      // HTTP en clair permis (serveur du réseau local sans certificat) ; la configuration réseau
      // Android générée le limite de toute façon à l'hôte de ce serveur
      cleartext: true,
      // L'interface embarquée peut rediriger vers ce serveur, et seulement lui
      allowNavigation: [new URL(server.url).hostname],
    }),
  },
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
