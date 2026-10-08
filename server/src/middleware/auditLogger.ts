import type { AuditAction, Prisma } from "@prisma/client";
import type { Request, RequestHandler, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";

/** User-Agent tronqué : utile pour identifier l'appareil, sans stocker d'empreinte complète. */
export const userAgentOf = (req: Request) => req.get("user-agent")?.slice(0, 160);

/**
 * Trace un événement de sécurité (connexion, déconnexion, refus d'accès…) avec l'IP de
 * l'appareil. Hors transaction : l'échec de l'écriture du journal ne doit pas bloquer
 * la réponse, mais il est signalé dans les journaux du serveur.
 */
export function auditEvent(req: Request, action: AuditAction, details: Prisma.InputJsonObject, userId: string | null = req.user?.id ?? null) {
  return audit(prisma, { id: userId, ip: req.ip ?? null }, action, details).catch((e) => {
    console.error(`Audit ${action} non enregistré`, e);
  });
}

/**
 * Middleware de journalisation : enregistre `action` une fois la réponse envoyée avec
 * succès. Les détails sont fournis par la route via `res.locals.audit`
 * ({ userId, details }), ou calculés par `describe`.
 */
export function auditLogger(
  action: AuditAction,
  describe?: (req: Request, res: Response) => { userId: string | null; details: Prisma.InputJsonObject } | null,
): RequestHandler {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const entry = describe ? describe(req, res) : (res.locals.audit as { userId: string | null; details: Prisma.InputJsonObject } | undefined);
      if (entry) void auditEvent(req, action, entry.details, entry.userId);
    });
    next();
  };
}
