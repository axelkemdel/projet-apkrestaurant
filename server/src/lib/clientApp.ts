import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Response } from "express";

/**
 * Sert l'interface compilée (client/dist) depuis le serveur Node : l'application
 * Android (Capacitor) et les navigateurs chargent alors interface + API depuis la même
 * origine, condition pour des cookies HttpOnly + SameSite=Strict.
 *
 * En-têtes : l'API garde la politique CSP la plus stricte (helmet, default-src 'none') ;
 * l'interface reçoit une CSP adaptée à une application React (scripts du site seulement).
 */
const CLIENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Animations (styles en ligne posés par framer-motion) et Tailwind
  "style-src 'self' 'unsafe-inline'",
  // Photos des plats : téléversées (self) ou URL externes en HTTPS (CDN)
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // API et Socket.io servis par la même origine ('self' couvre aussi ws/wss du même hôte)
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const HASHED_ASSET = /[\\/]assets[\\/][^\\/]+-[\w-]{8,}\.(?:js|css|woff2?)$/;

function clientHeaders(res: Response) {
  res.setHeader("Content-Security-Policy", CLIENT_CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function serveClient(app: Express) {
  if (process.env.SERVE_CLIENT === "false") return;
  const dir = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : fileURLToPath(new URL("../../../client/dist", import.meta.url));
  const index = resolve(dir, "index.html");
  if (!existsSync(index)) return;

  // Fichiers à empreinte (assets/*) : cache long ; index.html : jamais en cache (nouvelle version immédiate)
  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, path) => {
        clientHeaders(res);
        // Seuls les fichiers à empreinte générés par Vite (index-Ab12Cd34.js) sont immuables ;
        // les images publiques (logo, fond) gardent leur nom : revalidées à chaque chargement
        res.setHeader("Cache-Control", HASHED_ASSET.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }),
  );
  // Routes de l'application (/login, /pos/tables, /qr/…) : index.html ; /api et /socket.io exclus
  app.get(/^\/(?!api\/|api$|socket\.io\/|uploads\/).*/, (_req, res) => {
    clientHeaders(res);
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  console.log(`Interface servie depuis ${dir}`);
}
