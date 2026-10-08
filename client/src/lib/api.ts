import { useAuth } from "../store/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Appel API même origine : le cookie de session HttpOnly est joint automatiquement
 * par le navigateur (credentials « same-origin »), aucun jeton n'est manipulé ici.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      // FormData (upload d'image) : le navigateur fixe lui-même le boundary multipart
      ...(!(init.body instanceof FormData) && { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) useAuth.getState().expire();
    throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`);
  }
  return body as T;
}
