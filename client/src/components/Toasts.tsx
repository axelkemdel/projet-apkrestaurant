import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let nextId = 1;

export const useToasts = create<{ toasts: Toast[]; push: (kind: ToastKind, message: string) => void; dismiss: (id: number) => void }>(
  (set) => ({
    toasts: [],
    push: (kind, message) => {
      const id = nextId++;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 6000 : 3500);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  error: (m: string) => useToasts.getState().push("error", m),
  info: (m: string) => useToasts.getState().push("info", m),
};

const styles: Record<ToastKind, { cls: string; Icon: typeof CheckCircle2 }> = {
  success: { cls: "bg-emerald-600", Icon: CheckCircle2 },
  error: { cls: "bg-red-600", Icon: AlertTriangle },
  info: { cls: "bg-slate-900", Icon: BellRing },
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const { cls, Icon } = styles[t.kind];
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${cls}`}
            >
              <Icon size={18} className="shrink-0" />
              {t.message}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
