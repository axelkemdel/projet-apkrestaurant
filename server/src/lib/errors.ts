import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { Prisma } from "@prisma/client";
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
  // Corps JSON illisible ou trop gros (body-parser) : erreur du client, pas du serveur
  const bodyError = (err as { type?: unknown })?.type;
  if (bodyError === "entity.too.large") return make(413, "http.payloadTooLarge");
  if (typeof bodyError === "string" && bodyError.startsWith("entity.") || (err as { type?: unknown })?.type === "charset.unsupported") {
    return make(400, "http.invalidData");
  }
  // Prisma : élément disparu entre-temps / encore référencé — jamais de détail SQL renvoyé
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return make(404, "http.resourceNotFound");
    if (err.code === "P2003" || err.code === "P2002") return make(409, "http.conflict");
  }
  console.error(err);
  return make(500, "http.internal");
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, ...body } = toErrorPayload(err, langOf(req));
  res.status(status).json(body);
};
