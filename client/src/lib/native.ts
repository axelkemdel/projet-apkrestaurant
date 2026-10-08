import { Capacitor } from "@capacitor/core";

/**
 * Intégration Android (Capacitor). Sans effet dans un navigateur : les plugins sont
 * chargés à la demande, uniquement dans l'application native.
 */
export const isNative = Capacitor.isNativePlatform();

/**
 * Application lancée sur l'interface embarquée dans l'APK (aucun serveur configuré à la
 * compilation, CAP_SERVER_URL) : l'API n'est pas joignable depuis cette origine.
 */
export const isBundledWithoutServer = isNative && window.location.hostname === "localhost";

export async function initNative() {
  if (!isNative) return;
  const [{ StatusBar, Style }, { Keyboard }] = await Promise.all([import("@capacitor/status-bar"), import("@capacitor/keyboard")]);
  // Barre d'état sombre, assortie aux écrans (cuisine, connexion), sans recouvrir l'interface
  await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: "#0f172a" }).catch(() => undefined);
  // Clavier virtuel ouvert : classe CSS pour masquer les barres flottantes du bas
  void Keyboard.addListener("keyboardWillShow", () => document.documentElement.classList.add("keyboard-open"));
  void Keyboard.addListener("keyboardWillHide", () => document.documentElement.classList.remove("keyboard-open"));
}

/** Caisse et cuisine : écran verrouillé en paysage ; autres écrans : orientation libre (serveurs sur téléphone). */
export async function applyOrientation(pathname: string) {
  if (!isNative) return;
  const { ScreenOrientation } = await import("@capacitor/screen-orientation");
  const landscape = pathname.startsWith("/kds") || pathname.startsWith("/cashier");
  await (landscape ? ScreenOrientation.lock({ orientation: "landscape" }) : ScreenOrientation.unlock()).catch(() => undefined);
}
