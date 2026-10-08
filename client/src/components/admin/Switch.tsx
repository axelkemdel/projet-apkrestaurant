import { motion } from "framer-motion";

/** Interrupteur tactile : piste visuelle de 28 px, zone de toucher de 48 px. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex h-12 min-w-14 shrink-0 items-center justify-center disabled:opacity-50"
    >
      <span className={`flex h-7 w-12 items-center rounded-full px-1 transition-colors ${checked ? "bg-emerald-500" : "bg-slate-300"}`}>
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={`h-5 w-5 rounded-full bg-white shadow ${checked ? "ml-auto" : ""}`}
        />
      </span>
    </button>
  );
}
