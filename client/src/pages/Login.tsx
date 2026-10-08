import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, Delete, LayoutDashboard, Loader2, UtensilsCrossed, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { roleLabel } from "../lib/format";
import { useAuth } from "../store/auth";
import type { Role, User } from "../types";

const roleIcon: Record<Role, typeof ChefHat> = {
  SERVEUR: UtensilsCrossed,
  CUISINE: ChefHat,
  CAISSE: Wallet,
  ADMIN: LayoutDashboard,
};

export function Login() {
  const login = useAuth((s) => s.login);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<User[]>("/auth/users").then(setUsers).catch((e) => setError(e.message));
  }, []);

  async function submit(code: string) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ userId: selected.id, pin: code }),
      });
      login(res.token, res.user);
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  function press(digit: string) {
    if (loading) return;
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 4) void submit(next);
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
                  className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-5 text-white hover:bg-slate-700"
                >
                  <Icon className="text-brand-500" size={28} />
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-xs text-slate-400">{roleLabel[u.role]}</span>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto max-w-xs">
            <div className="mb-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-brand-500" : "bg-slate-700"}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <PinKey key={d} onClick={() => press(d)}>
                  {d}
                </PinKey>
              ))}
              <PinKey
                onClick={() => {
                  setSelected(null);
                  setPin("");
                  setError(null);
                }}
                className="text-sm"
              >
                Retour
              </PinKey>
              <PinKey onClick={() => press("0")}>0</PinKey>
              <PinKey onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Effacer">
                {loading ? <Loader2 className="animate-spin" /> : <Delete />}
              </PinKey>
            </div>
          </div>
        )}

        {error && <p className="mt-6 text-center text-sm font-medium text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function PinKey({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex h-16 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-semibold text-white active:bg-brand-600 ${className}`}
    />
  );
}
