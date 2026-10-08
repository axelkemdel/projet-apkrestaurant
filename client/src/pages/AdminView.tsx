import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { BarChart3, BookOpen, ChefHat, ChevronsLeft, ChevronsRight, LayoutGrid, QrCode, ScrollText, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { useTranslation } from "react-i18next";
import { Modal } from "../components/Modal";
import { StatsTab } from "../components/admin/StatsTab";
import { MenuTab } from "../components/admin/MenuTab";
import { StaffTab } from "../components/admin/StaffTab";
import { AuditTab } from "../components/admin/AuditTab";
import { TablesTab } from "../components/admin/TablesTab";

const TABS = [
  // `path` : adresse de l'onglet (/admin/dashboard, /admin/users…)
  { id: "stats", path: "dashboard", label: "admin.tabStats", short: "admin.shortStats", Icon: BarChart3 },
  { id: "menu", path: "menu", label: "admin.tabMenu", short: "admin.shortMenu", Icon: BookOpen },
  { id: "tables", path: "tables", label: "admin.tabTables", short: "admin.shortTables", Icon: QrCode },
  { id: "staff", path: "users", label: "admin.tabStaff", short: "admin.shortStaff", Icon: Users },
  { id: "audit", path: "audit", label: "admin.tabAudit", short: "admin.shortAudit", Icon: ScrollText },
] as const;
type TabId = (typeof TABS)[number]["id"];

const VIEWS: { to: string; label: "nav.floorLong" | "nav.kitchenLong" | "nav.cashier"; Icon: typeof Wallet }[] = [
  { to: "/pos/tables", label: "nav.floorLong", Icon: UtensilsCrossed },
  { to: "/kds/kitchen", label: "nav.kitchenLong", Icon: ChefHat },
  { to: "/cashier/checkout", label: "nav.cashier", Icon: Wallet },
];

/** Barre latérale dépliée par défaut sur grand écran (> 1024 px), repliée sur tablette. */
function defaultCollapsed() {
  try {
    const saved = localStorage.getItem("admin-sidebar");
    if (saved === "open") return false;
    if (saved === "collapsed") return true;
  } catch {
    /* préférence indisponible */
  }
  return window.innerWidth <= 1024;
}

/**
 * Tableau de bord gérant, mobile d'abord :
 *  - smartphone (< 640 px) : barre d'onglets en bas, contenu sur une colonne ;
 *  - tablette / caisse tactile (640–1024 px) : barre latérale rétractable (icônes) ;
 *  - grand écran (> 1024 px) : barre latérale dépliée, contenu centré (max-w-7xl).
 */
export function AdminView() {
  const { t } = useTranslation();
  // L'onglet actif est porté par l'adresse : /admin/dashboard, /admin/menu, /admin/users…
  const { section } = useParams();
  const navigate = useNavigate();
  const current = TABS.find((x) => x.path === section);
  const tab: TabId = current?.id ?? "stats";
  const setTab = (id: TabId) => navigate(`/admin/${TABS.find((x) => x.id === id)!.path}`);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [viewsOpen, setViewsOpen] = useState(false);

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("admin-sidebar", c ? "open" : "collapsed");
      } catch {
        /* préférence non mémorisée */
      }
      return !c;
    });
  }


  if (!current) return <Navigate to="/admin/dashboard" replace />;

  return (
    <div className="flex h-full flex-col">
      <AppHeader title={t((current ?? TABS[0]).label)} hideNav />
      <div className="flex min-h-0 flex-1">
        {/* Barre latérale : tablette et plus */}
        <motion.aside
          animate={{ width: collapsed ? 76 : 240 }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className="hidden shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white sm:flex"
        >
          <nav className="flex flex-1 flex-col gap-1 p-3" role="tablist" aria-orientation="vertical">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                title={collapsed ? t(label) : undefined}
                onClick={() => setTab(id)}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap ${
                  tab === id ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span className={collapsed ? "sr-only" : ""}>{t(label)}</span>
              </button>
            ))}
            <div className="my-2 border-t border-slate-100" />
            {VIEWS.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? t(label) : undefined}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap text-slate-500 hover:bg-slate-100"
              >
                <Icon size={20} className="shrink-0" />
                <span className={collapsed ? "sr-only" : ""}>{t(label)}</span>
              </NavLink>
            ))}
          </nav>
          <button
            onClick={toggleSidebar}
            className="m-3 flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100"
            aria-label={collapsed ? t("admin.expandMenu") : t("admin.collapseMenu")}
          >
            {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
            {!collapsed && t("admin.collapse")}
          </button>
        </motion.aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-3 pb-24 sm:p-4 sm:pb-6 lg:p-6">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {tab === "stats" ? (
                  <StatsTab />
                ) : tab === "menu" ? (
                  <MenuTab />
                ) : tab === "tables" ? (
                  <TablesTab />
                ) : tab === "staff" ? (
                  <StaffTab />
                ) : (
                  <AuditTab />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Barre d'onglets inférieure : smartphone */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        role="tablist"
      >
        {TABS.map(({ id, short, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${tab === id ? "text-brand-600" : "text-slate-500"}`}
          >
            {tab === id && <motion.span layoutId="bottom-tab" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-500" />}
            <Icon size={22} />
            {t(short)}
          </button>
        ))}
        <button onClick={() => setViewsOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500">
          <LayoutGrid size={22} />
          {t("admin.screens")}
        </button>
      </nav>

      <Modal open={viewsOpen} onClose={() => setViewsOpen(false)} title={t("admin.otherScreens")}>
        <div className="grid gap-2">
          {VIEWS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 px-4 font-semibold text-slate-700 active:bg-slate-100">
              <Icon size={20} /> {t(label)}
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
}
