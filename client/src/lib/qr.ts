import QRCode from "qrcode";

/**
 * QR codes des tables. L'adresse encodée est celle de la page client
 * (/qr/<jeton secret>) ; VITE_PUBLIC_URL permet d'imprimer l'adresse publique du
 * restaurant même si l'administration est ouverte depuis le réseau local.
 */
export function publicBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();
  return (configured || window.location.origin).replace(/\/+$/, "");
}

export const tableUrl = (qrToken: string) => `${publicBaseUrl()}/qr/${qrToken}`;

/** Adresse joignable uniquement depuis cet appareil : un QR code imprimé avec elle ne marcherait pas. */
export function isLocalOnly(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return true;
  }
}

// Correction d'erreur « M » (15 %) : lisible même un peu taché ou plastifié
const QR_OPTIONS = { errorCorrectionLevel: "M" as const, margin: 1 };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", color: { dark: "#0f172a", light: "#ffffff" } });
}

/** Image PNG haute définition (1024 px) avec le numéro de table sous le QR code. */
export async function qrPng(url: string, caption: string, subtitle: string): Promise<Blob> {
  const size = 1024;
  const qr = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: size - 128 });
  const img = new Image();
  img.src = qr;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + 220;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 64, 64, size - 128, size - 128);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.font = "bold 96px Inter, system-ui, sans-serif";
  ctx.fillText(caption, size / 2, size + 40);
  ctx.fillStyle = "#475569";
  ctx.font = "40px Inter, system-ui, sans-serif";
  ctx.fillText(subtitle, size / 2, size + 120);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG"))), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface QrCard {
  url: string;
  title: string;
  zone: string;
}

/**
 * Planche A4 imprimable (6 supports par page, à découper) ouverte dans une fenêtre
 * dédiée : « Enregistrer au format PDF » dans la boîte d'impression donne le PDF.
 * La fenêtre doit être ouverte AVANT tout await (sinon le navigateur la bloque).
 */
export async function printQrSheet(
  win: Window,
  cards: QrCard[],
  texts: { restaurant: string; lineFr: string; lineEn: string; docTitle: string },
) {
  const svgs = await Promise.all(cards.map((c) => qrSvg(c.url)));
  const body = cards
    .map(
      (c, i) => `<section class="card">
  <div class="resto">${escapeHtml(texts.restaurant)}</div>
  <div class="table">${escapeHtml(c.title)}</div>
  <div class="qr">${svgs[i]}</div>
  <div class="line">${escapeHtml(texts.lineFr)}</div>
  <div class="line en">${escapeHtml(texts.lineEn)}</div>
  <div class="zone">${escapeHtml(c.zone)}</div>
</section>`,
    )
    .join("\n");
  win.document.open();
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(texts.docTitle)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
  .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .card { border: 1px dashed #94a3b8; border-radius: 4mm; padding: 6mm 5mm; text-align: center; height: 88mm; display: flex; flex-direction: column; align-items: center; justify-content: center; break-inside: avoid; page-break-inside: avoid; }
  .resto { font-size: 10pt; font-weight: 600; color: #ea580c; text-transform: uppercase; letter-spacing: .05em; }
  .table { font-size: 20pt; font-weight: 800; margin: 1mm 0 2mm; }
  .qr svg { width: 46mm; height: 46mm; display: block; }
  .line { font-size: 10pt; font-weight: 600; margin-top: 2mm; }
  .line.en { font-weight: 400; color: #475569; margin-top: .5mm; font-style: italic; }
  .zone { font-size: 8pt; color: #94a3b8; margin-top: 1mm; }
  @media screen { body { background: #f1f5f9; } .sheet { max-width: 190mm; margin: 10mm auto; } .card { background: #fff; } }
</style></head><body><main class="sheet">${body}</main>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });</script>
</body></html>`);
  win.document.close();
}
