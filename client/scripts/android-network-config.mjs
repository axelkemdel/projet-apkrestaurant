// Génère android/app/src/main/res/xml/network_security_config.xml à partir de CAP_SERVER_URL.
// Exécuté automatiquement après « npx cap sync » (script npm capacitor:sync:after).
//  - HTTPS obligatoire partout (certificats système uniquement) ;
//  - HTTP en clair autorisé UNIQUEMENT vers l'hôte du serveur RestoApp s'il est en http://
//    (serveur du réseau local sans certificat). Recommandé : HTTPS, aucune exception.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = resolve(dirname(fileURLToPath(import.meta.url)), "../android/app/src/main/res/xml/network_security_config.xml");
const raw = process.env.CAP_SERVER_URL?.trim();
let cleartextHost = null;
if (raw) {
  const url = new URL(raw);
  if (url.protocol === "http:") cleartextHost = url.hostname;
}

const escape = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const domain = cleartextHost
  ? `
    <!-- Serveur RestoApp du réseau local en HTTP (CAP_SERVER_URL=${escape(raw)}) -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">${escape(cleartextHost)}</domain>
    </domain-config>`
  : "";

const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Fichier généré par scripts/android-network-config.mjs : ne pas modifier à la main. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>${domain}
</network-security-config>
`;
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, xml);
console.log(cleartextHost ? `✔ Réseau Android : HTTPS partout, HTTP autorisé vers ${cleartextHost} uniquement` : "✔ Réseau Android : HTTPS uniquement");
