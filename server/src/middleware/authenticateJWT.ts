import type { RequestHandler } from "express";
import { ACCESS_COOKIE, authenticate } from "../lib/auth.js";

/**
 * Authentifie la requête par le jeton d'accès (cookie HttpOnly). Aucun autre canal
 * n'est accepté : un en-tête `Authorization: Bearer` est ignoré (un jeton lisible par
 * JavaScript serait exposé à un XSS).
 */
export const authenticateJWT: RequestHandler = async (req, _res, next) => {
  const { user, sessionId } = await authenticate(req.cookies?.[ACCESS_COOKIE]);
  req.user = user;
  req.sessionId = sessionId;
  next();
};
