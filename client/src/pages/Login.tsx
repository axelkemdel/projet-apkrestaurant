import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, LayoutDashboard, UtensilsCrossed, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { roleLabel } from "../lib/format";
import { loginWithPin } from "../lib/session";
import { PinPad } from "../components/PinPad";
import type { Role, User } from "../types";

const roleIcon: Record<Role, typeof ChefHat> = {
  SERVEUR: UtensilsCrossed,
  CUISINE: ChefHat,
  CAISSE: Wallet,
  ADMIN: LayoutDashboard,
};

export function Login() {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<User[]>("/auth/users").then(setUsers).catch((e) => setError(e.message));
  }, []);

  async function submit(pin: string) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await loginWithPin(selected.id, pin);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="rounded-xl bg-brand-500 px-3 py-1.5 text-2xl font-black text-white">RestoApp</span>
          <p className="mt-4 text-slate-400">{selected ? `Bonjour ${selected.name}, entrez votre code` : "Qui êtes-vous ?"}</p>
        </div>

        {!selected ? (
          <div className="grid grid-cols-2 gap-3">
            {users.map((u) => {
              const Icon = roleIcon[u.role];
              return (
                <motion.button
                  key={u.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setSelected(u)}
                  className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 p-4 text-white hover:bg-slate-700"
                >
                  <Icon className="text-brand-500" size={28} />
                  <span className="text-center font-semibold">{u.name}</span>
                  <span className="text-xs text-slate-400">{roleLabel[u.role]}</span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <>
            <PinPad onSubmit={submit} loading={loading} />
            <button
              onClick={() => {
                setSelected(null);
                setError(null);
              }}
              className="mx-auto mt-4 block min-h-12 px-4 text-sm font-medium text-slate-400 hover:text-white"
            >
              ← Changer de profil
            </button>
          </>
        )}

        {error && <p className="mt-4 text-center text-sm font-medium text-red-400" role="alert">{error}</p>}
      </div>
    </div>
  );
}
