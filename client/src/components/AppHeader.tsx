import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Lock, LogOut, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "../store/auth";
import { useSocketStatus } from "../lib/socket";
import { lockSession, logout, IDLE_LOCK_MINUTES } from "../lib/session";
import { roleLabel } from "../lib/format";

export function AppHeader({
  title,
  children,
  dark = false,
  hideNav = false,
}: {
  title: string;
  children?: ReactNode;
  dark?: boolean;
  /** Le tableau de bord gérant porte sa propre navigation (barre latérale / barre du bas). */
  hideNav?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const connected = useSocketStatus();

  return (
    <header
      className={`flex h-14 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 ${
        dark ? "border-b border-slate-800 bg-slate-950 text-slate-100" : "border-b border-slate-200 bg-white"
      }`}
    >
      <span className="rounded-lg bg-brand-500 px-2 py-1 text-sm font-black tracking-tight text-white">
        <span className="sm:hidden">R</span>
        <span className="hidden sm:inline">RestoApp</span>
      </span>
      <h1 className="truncate text-base font-semibold">{title}</h1>
      {user?.role === "ADMIN" && !hideNav && (
        <nav className="hidden gap-1 md:flex">
          {[
            ["/serveur", "Salle"],
            ["/cuisine", "Cuisine"],
            ["/caisse", "Caisse"],
            ["/admin", "Gérant"],
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `rounded-lg px-2.5 py-1 text-sm font-medium ${
                  isActive ? "bg-brand-500 text-white" : dark ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="flex-1" />
      {children}
      <span
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          connected ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"
        }`}
        title={connected ? "Temps réel connecté" : "Connexion perdue — reconnexion…"}
      >
        {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
        <span className="hidden sm:inline">{connected ? "En ligne" : "Hors ligne"}</span>
      </span>
      {user && (
        <span className="hidden text-sm opacity-70 md:inline">
          {user.name} · {roleLabel[user.role]}
        </span>
      )}
      {user && IDLE_LOCK_MINUTES[user.role] && (
        <button
          onClick={() => void lockSession()}
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
          aria-label="Verrouiller l'écran"
          title="Verrouiller l'écran"
        >
          <Lock size={18} />
        </button>
      )}
      <button
        onClick={() => void logout()}
        className={`flex h-11 w-11 items-center justify-center rounded-lg ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
        aria-label="Se déconnecter"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
