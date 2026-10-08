import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { isMessageKey, langOf, translate, type Lang, type MessageKey, type MessageParams } from "./i18n.js";

/** Erreur métier : un code de message stable, traduit au moment de la réponse. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: MessageKey,
    public params: MessageParams = {},
  ) {
    super(translate("fr", code, params));
  }
}

export interface ErrorPayload {
  status: number;
  code: MessageKey;
  error: string;
  details?: unknown;
}

export function toErrorPayload(err: unknown, lang: Lang = "fr"): ErrorPayload {
  const make = (status: number, code: MessageKey, params?: MessageParams, details?: unknown): ErrorPayload => ({
    status,
    code,
    error: translate(lang, code, params),
    ...(details !== undefined && { details }),
  });
  if (err instanceof HttpError) return make(err.status, err.code, err.params);
  if (err instanceof multer.MulterError) {
    return err.code === "LIMIT_FILE_SIZE" ? make(413, "upload.tooLarge") : make(400, "upload.rejected");
  }
  if (err instanceof ZodError) {
    // Message personnalisé (code connu) du premier problème, sinon message générique
    const first = err.issues[0]?.message;
    return make(400, first && isMessageKey(first) ? first : "http.invalidData", {}, err.flatten());
  }
  console.error(err);
  return make(500, "http.internal");
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, ...body } = toErrorPayload(err, langOf(req));
  res.status(status).json(body);
};
