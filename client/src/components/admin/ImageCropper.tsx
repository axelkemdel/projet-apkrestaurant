import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Move, ZoomIn } from "lucide-react";

const ASPECT = 4 / 3;
const OUTPUT_W = 800;
const OUTPUT_H = 600;

/**
 * Recadrage 4:3 d'une photo de plat : glisser pour cadrer, curseur pour zoomer.
 * L'image est réencodée (WebP, sinon JPEG) en 800×600 côté navigateur : fichier
 * plus léger pour les tablettes, et métadonnées EXIF (GPS, appareil) supprimées.
 */
export function ImageCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (cropped: File) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setSrc(url);
    const image = new Image();
    // Garde : une image d'un rendu précédent (URL déjà libérée) ne doit pas écraser l'état
    image.onload = () => !cancelled && setImg(image);
    image.onerror = () => !cancelled && setError("Image illisible");
    image.src = url;
    return () => {
      cancelled = true;
      image.onload = image.onerror = null;
      image.src = "";
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameH = frameW / ASPECT;
  const baseScale = img ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const imgW = (img?.naturalWidth ?? 0) * scale;
  const imgH = (img?.naturalHeight ?? 0) * scale;

  // L'image doit toujours couvrir entièrement le cadre
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(frameW - imgW, p.x)),
    y: Math.min(0, Math.max(frameH - imgH, p.y)),
  });

  // Centrage initial et après zoom
  useEffect(() => {
    if (!img || !frameW) return;
    setPos((p) => clamp(p.x === 0 && p.y === 0 ? { x: (frameW - imgW) / 2, y: (frameH - imgH) / 2 } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, frameW, zoom]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ...pos };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragStart.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  }

  async function apply() {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, frameW / scale, frameH / scale, 0, 0, OUTPUT_W, OUTPUT_H);
    const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
    // WebP si le navigateur sait l'encoder, sinon JPEG
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    setBusy(false);
    if (!blob) return setError("Recadrage impossible sur ce navigateur");
    onDone(new File([blob], blob.type === "image/webp" ? "plat.webp" : "plat.jpg", { type: blob.type }));
  }

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className="relative w-full touch-none overflow-hidden rounded-xl bg-slate-900 select-none"
        style={{ aspectRatio: `${ASPECT}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragStart.current = null)}
        onPointerCancel={() => (dragStart.current = null)}
      >
        {src && img && (
          <img
            src={src}
            alt="Photo à recadrer"
            draggable={false}
            className="pointer-events-none absolute max-w-none cursor-grab"
            style={{ width: imgW, height: imgH, left: pos.x, top: pos.y }}
          />
        )}
        {!img && !error && <Loader2 className="absolute inset-0 m-auto animate-spin text-slate-500" />}
        {/* Repères des tiers */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border border-white/15" />
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
          <Move size={12} /> Glissez pour cadrer
        </span>
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <ZoomIn size={18} className="shrink-0 text-slate-500" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-12 flex-1 accent-brand-500"
          aria-label="Zoom"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl bg-slate-100 font-semibold hover:bg-slate-200">
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!img || busy}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Valider le cadrage
        </button>
      </div>
    </div>
  );
}
