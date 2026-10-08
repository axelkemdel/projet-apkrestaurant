import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, BookOpen, Users } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { StatsTab } from "../components/admin/StatsTab";
import { MenuTab } from "../components/admin/MenuTab";
import { StaffTab } from "../components/admin/StaffTab";

const TABS = [
  { id: "stats", label: "Aperçu / Stats", Icon: BarChart3 },
  { id: "menu", label: "Gestion du menu", Icon: BookOpen },
  { id: "staff", label: "Personnel & PIN", Icon: Users },
] as const;
type TabId = (typeof TABS)[number]["id"];

function readTab(): TabId {
  try {
    const v = sessionStorage.getItem("admin-tab");
    return TABS.some((t) => t.id === v) ? (v as TabId) : "stats";
  } catch {
    return "stats";
  }
}

export function AdminView() {
  const [tab, setTab] = useState<TabId>(readTab);

  function select(id: TabId) {
    setTab(id);
    try {
      sessionStorage.setItem("admin-tab", id);
    } catch {
      /* onglet non mémorisé */
    }
  }

  return (
    <div className="flex h-full flex-col">
      <AppHeader title="Tableau de bord" />
      <div className="border-b border-slate-200 bg-white px-4">
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto" role="tablist">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-semibold ${tab === id ? "text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Icon size={16} /> {label}
              {tab === id && <motion.span layoutId="admin-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500" />}
            </button>
          ))}
        </nav>
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {tab === "stats" ? <StatsTab /> : tab === "menu" ? <MenuTab /> : <StaffTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
