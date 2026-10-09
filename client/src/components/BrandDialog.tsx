import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Fenêtre de dialogue aux couleurs Appresto (fond flouté, carte sombre, liseré orange),
 * pour les messages de session. Le focus est placé sur le bouton principal à l'ouverture.
 */
export function BrandDialog({
  open,
  role = "dialog",
  labelledBy,
  describedBy,
  onEscape,
  children,
}: {
  open: boolean;
  role?: "dialog" | "alertdialog";
  labelledBy: string;
  describedBy: string;
  onEscape?: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEscape();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onEscape]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            ref={panel}
            role={role}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className="w-full max-w-sm rounded-2xl border border-orange-500/25 bg-slate-900/95 p-6 text-center text-slate-100 shadow-2xl shadow-orange-950/40"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const primaryButton =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] px-4 font-semibold text-white shadow-lg shadow-orange-600/30 hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300";
export const secondaryButton =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 font-semibold text-slate-200 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";
