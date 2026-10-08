import type { ReactNode } from "react";
import { LogOut, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "../store/auth";
import { disconnectSocket, useSocketStatus } from "../lib/socket";
import { roleLabel } from "../lib/format";

export function AppHeader({ title, children, dark = false }: { title: string; children?: ReactNode; dark?: boolean }) {
  const { user, logout } = useAuth();
  const connected = useSocketStatus();

  return (
    <header
      className={`flex h-14 shrink-0 items-center gap-3 px-4 ${
        dark ? "border-b border-slate-800 bg-slate-950 text-slate-100" : "border-b border-slate-200 bg-white"
      }`}
    >
      <span className="rounded-lg bg-brand-500 px-2 py-1 text-sm font-black tracking-tight text-white">RestoApp</span>
      <h1 className="truncate text-base font-semibold">{title}</h1>
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
      <button
        onClick={() => {
          disconnectSocket();
          logout();
        }}
        className={`rounded-lg p-2 ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
        aria-label="Se déconnecter"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
