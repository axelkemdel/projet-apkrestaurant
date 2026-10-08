import { useAuth } from "../store/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token && { authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) useAuth.getState().logout();
    throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`);
  }
  return body as T;
}
