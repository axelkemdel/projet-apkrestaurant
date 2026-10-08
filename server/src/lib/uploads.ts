import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { HttpError } from "./errors.js";

/** Racine des fichiers téléversés, servie en statique sous `/uploads`. */
export const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");
const DISHES_DIR = path.join(UPLOADS_DIR, "dishes");
const DISHES_URL = "/uploads/dishes/";
mkdirSync(DISHES_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Multer en mémoire : le fichier n'est écrit sur disque qu'après vérification
 * de sa signature binaire (le type MIME envoyé par le navigateur n'est pas fiable).
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 20 },
}).single("image");

/** Signatures acceptées : JPEG, PNG, WebP. Le SVG est exclu (peut embarquer du script). */
function detectImageType(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Enregistre l'image d'un plat sous un nom aléatoire et renvoie son URL publique. */
export async function saveDishImage(file: Express.Multer.File): Promise<string> {
  const ext = detectImageType(file.buffer);
  if (!ext) throw new HttpError(400, "Format d'image non supporté (JPEG, PNG ou WebP uniquement)");
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(DISHES_DIR, name), file.buffer);
  return DISHES_URL + name;
}

/** Supprime un fichier téléversé (sans effet pour une URL externe ou déjà absente). */
export async function deleteDishImage(url: string | null | undefined) {
  if (!url?.startsWith(DISHES_URL)) return;
  const name = path.basename(url);
  // basename + préfixe fixe : impossible de sortir du dossier des images
  await unlink(path.join(DISHES_DIR, name)).catch(() => {});
}

export function isLocalDishImage(url: string) {
  return url.startsWith(DISHES_URL) && /^[\w-]+\.(jpg|png|webp)$/.test(url.slice(DISHES_URL.length));
}
