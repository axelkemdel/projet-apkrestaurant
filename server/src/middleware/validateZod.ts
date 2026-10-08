import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

/**
 * Validation stricte du corps de requête par un schéma Zod, AVANT la logique métier.
 * Le corps est remplacé par la valeur validée (champs inconnus refusés par `.strict()`,
 * valeurs normalisées) ; une erreur devient une réponse 400 traduite.
 */
export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
