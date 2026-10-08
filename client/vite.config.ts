import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const API = process.env.VITE_API_TARGET ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // accessible depuis les tablettes du réseau local
    allowedHosts: [".app.github.dev"], // URL transférée par GitHub Codespaces
    proxy: {
      "/api": API,
      "/uploads": API,
      "/socket.io": { target: API, ws: true },
    },
  },
});
