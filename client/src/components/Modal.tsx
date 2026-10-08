import type { ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsPhone } from "../lib/useMediaQuery";

/**
 * Fenêtre modale. Sur smartphone, elle devient un tiroir (bottom sheet) qui
 * monte du bas de l'écran et se ferme en le faisant glisser vers le bas.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const drag = useDragControls();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:pb-0"
            initial={isPhone ? { y: "100%" } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={isPhone ? { y: "100%" } : { y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            drag={isPhone ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isPhone && (
              <div className="flex cursor-grab touch-none justify-center pb-1 pt-2.5" onPointerDown={(e) => drag.start(e)} aria-hidden="true">
                <span className="h-1.5 w-10 rounded-full bg-slate-300" />
              </div>
            )}
            <div
              className="flex touch-none items-start justify-between gap-4 border-b border-slate-100 px-5 py-3 sm:touch-auto sm:py-4"
              onPointerDown={(e) => isPhone && drag.start(e)}
            >
              <div className="min-w-0 text-lg font-semibold">{title}</div>
              <button onClick={onClose} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100" aria-label={t("common.close")}>
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="border-t border-slate-100 px-5 py-3 sm:py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
