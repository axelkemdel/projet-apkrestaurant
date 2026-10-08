import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveServerUrl } from "./scripts/server-url.cjs";

const API = process.env.VITE_API_TARGET ?? "http://localhost:4000";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Compilation : adresse du serveur injectée dans l'interface embarquée de l'APK (même
  // résolution que capacitor.config.ts) ; l'application y redirige si elle démarre sans elle
  define: {
    "import.meta.env.VITE_SERVER_URL": JSON.stringify(command === "build" ? (resolveServerUrl()?.url ?? "") : ""),
  },
  server: {
    host: true, // accessible depuis les tablettes du réseau local
    allowedHosts: [".app.github.dev"], // URL transférée par GitHub Codespaces
    proxy: {
      "/api": API,
      "/uploads": API,
      "/socket.io": { target: API, ws: true },
    },
  },
}));
