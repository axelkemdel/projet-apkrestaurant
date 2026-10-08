import { useAuth } from "../store/auth";
import { currentLang } from "../i18n";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Renouvelle le jeton d'accès (15 min) grâce au jeton de rafraîchissement (cookie
 * HttpOnly limité à /api/auth). Une seule requête à la fois, partagée par tous les appels.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin", headers: { "accept-language": currentLang() } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Appel API même origine : le cookie de session HttpOnly est joint automatiquement
 * par le navigateur (credentials « same-origin »), aucun jeton n'est manipulé ici.
 */
export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      // FormData (upload d'image) : le navigateur fixe lui-même le boundary multipart
      ...(!(init.body instanceof FormData) && { "content-type": "application/json" }),
      // Messages d'erreur de l'API dans la langue de l'écran
      "accept-language": currentLang(),
      ...init.headers,
    },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    // Jeton d'accès expiré : un rafraîchissement, puis la requête est rejouée une fois
    if (res.status === 401 && !path.startsWith("/auth/") && !path.startsWith("/public/")) {
      if (!retried && useAuth.getState().user && (await refreshSession())) return api<T>(path, init, true);
      useAuth.getState().expire();
    }
    throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`);
  }
  return body as T;
}
