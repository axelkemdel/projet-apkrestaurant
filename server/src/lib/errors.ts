import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import multer from "multer";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function toErrorPayload(err: unknown): { status: number; error: string; details?: unknown } {
  if (err instanceof HttpError) return { status: err.status, error: err.message };
  if (err instanceof multer.MulterError) {
    return err.code === "LIMIT_FILE_SIZE"
      ? { status: 413, error: "Image trop lourde (3 Mo maximum)" }
      : { status: 400, error: "Fichier refusé" };
  }
  if (err instanceof ZodError) return { status: 400, error: "Données invalides", details: err.flatten() };
  console.error(err);
  return { status: 500, error: "Erreur interne du serveur" };
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, ...body } = toErrorPayload(err);
  res.status(status).json(body);
};
