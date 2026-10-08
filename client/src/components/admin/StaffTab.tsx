import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Modal } from "../Modal";
import { toast } from "../Toasts";
import { api } from "../../lib/api";
import { roleLabel } from "../../lib/format";
import { useAuth } from "../../store/auth";
import type { Role, StaffUser } from "../../types";

const ROLES: Role[] = ["SERVEUR", "CUISINE", "CAISSE", "ADMIN"];
const roleStyle: Record<Role, string> = {
  ADMIN: "bg-slate-900 text-white",
  SERVEUR: "bg-brand-100 text-brand-700",
  CUISINE: "bg-amber-100 text-amber-800",
  CAISSE: "bg-emerald-100 text-emerald-800",
};

export function StaffTab() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [editing, setEditing] = useState<StaffUser | null | undefined>(undefined);
  const [resetting, setResetting] = useState<StaffUser | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; pin: string } | null>(null);

  const load = useCallback(() => {
    api<StaffUser[]>("/admin/users")
      .then(setUsers)
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function setActive(u: StaffUser, isActive: boolean) {
    if (!isActive && !confirm(`Désactiver ${u.name} ? Ses sessions ouvertes seront fermées immédiatement.`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: "PUT", body: JSON.stringify({ isActive }) });
      toast.success(isActive ? `${u.name} réactivé` : `${u.name} désactivé`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!users) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex flex-1 items-start gap-2 text-sm text-slate-500">
          <ShieldCheck size={16} className="shrink-0 text-emerald-600" />
          Les codes PIN sont chiffrés : ils ne sont affichés qu'une fois, à la création ou à la réinitialisation.
        </p>
        <button
          onClick={() => setEditing(null)}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          <Plus size={16} /> Nouvel employé
        </button>
      </div>

      {/* Smartphone / tablette portrait : cartes tactiles */}
      <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
        {users.map((u) => (
          <motion.li layout key={u.id} className={`rounded-2xl bg-white p-4 shadow-sm ${u.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">
                  {u.name}
                  {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(vous)</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${roleStyle[u.role]}`}>{roleLabel[u.role]}</span>
                  <span className={`flex items-center gap-1 ${u.isActive ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className={`h-2 w-2 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {u.isActive ? "Actif" : "Désactivé"}
                  </span>
                </div>
              </div>
              <span className="font-mono tracking-[0.3em] text-slate-300" aria-label="Code PIN masqué">
                ••••
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => setEditing(u)} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-semibold">
                <Pencil size={16} /> Modifier
              </button>
              <button
                onClick={() => setResetting(u)}
                disabled={!u.isActive}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-sm font-semibold disabled:opacity-40"
              >
                <KeyRound size={16} /> PIN
              </button>
              {u.id !== me?.id ? (
                <button
                  onClick={() => void setActive(u, !u.isActive)}
                  className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ${
                    u.isActive ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {u.isActive ? <UserX size={16} /> : <UserCheck size={16} />}
                  {u.isActive ? "Désactiver" : "Réactiver"}
                </button>
              ) : (
                <span />
              )}
            </div>
          </motion.li>
        ))}
      </ul>

      {/* Tablette paysage et plus : tableau */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Nom</th>
              <th className="px-4 py-3 font-semibold">Rôle</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Code PIN</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <motion.tr layout key={u.id} className={u.isActive ? "" : "bg-slate-50 text-slate-400"}>
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-xs font-normal text-slate-400">(vous)</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${roleStyle[u.role]}`}>{roleLabel[u.role]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 ${u.isActive ? "text-emerald-700" : ""}`}>
                    <span className={`h-2 w-2 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {u.isActive ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="mr-3 font-mono tracking-[0.3em] text-slate-400">••••</span>
                  <button
                    onClick={() => setResetting(u)}
                    disabled={!u.isActive}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <KeyRound size={13} /> Réinitialiser
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(u)} className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Modifier ${u.name}`} title="Modifier">
                      <Pencil size={16} />
                    </button>
                    {u.id !== me?.id &&
                      (u.isActive ? (
                        <button onClick={() => void setActive(u, false)} className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Désactiver ${u.name}`} title="Désactiver">
                          <UserX size={16} />
                        </button>
                      ) : (
                        <button onClick={() => void setActive(u, true)} className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-700" aria-label={`Réactiver ${u.name}`} title="Réactiver">
                          <UserCheck size={16} />
                        </button>
                      ))}
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserForm
        user={editing}
        isSelf={editing?.id === me?.id}
        onClose={() => setEditing(undefined)}
        onSaved={(pin, name) => {
          setEditing(undefined);
          load();
          if (pin) setRevealed({ name, pin });
          else toast.success("Profil mis à jour");
        }}
      />
      <PinResetForm
        user={resetting}
        isSelf={resetting?.id === me?.id}
        onClose={() => setResetting(null)}
        onDone={(pin) => {
          setRevealed({ name: resetting!.name, pin });
          setResetting(null);
        }}
      />
      <PinReveal data={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function PinChoice({ mode, onMode, pin, onPin }: { mode: "auto" | "manual"; onMode: (m: "auto" | "manual") => void; pin: string; onPin: (p: string) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-slate-700">Code PIN</legend>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["auto", "Générer au hasard"],
            ["manual", "Saisir un code"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={`rounded-xl border-2 py-2.5 text-sm font-semibold ${mode === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "manual" && (
        <input
          required
          value={pin}
          onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4,6}"
          placeholder="4 à 6 chiffres"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-xl tracking-[0.5em] outline-none focus:border-brand-500"
        />
      )}
    </fieldset>
  );
}

function UserForm({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: StaffUser | null | undefined;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (pin: string | null, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("SERVEUR");
  const [pinMode, setPinMode] = useState<"auto" | "manual">("auto");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user === undefined) return;
    setName(user?.name ?? "");
    setRole(user?.role ?? "SERVEUR");
    setPinMode("auto");
    setPin("");
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (user) {
        await api(`/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify({ name: name.trim(), role }) });
        onSaved(null, name);
      } else {
        const res = await api<{ pin: string }>("/admin/users", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), role, ...(pinMode === "manual" && { pin }) }),
        });
        onSaved(res.pin, name.trim());
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={user !== undefined} onClose={onClose} title={user ? `Modifier ${user.name}` : "Nouvel employé"}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">Nom affiché</span>
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500" />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-slate-700">Rôle</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isSelf && r !== "ADMIN"}
                onClick={() => setRole(r)}
                className={`rounded-xl border-2 py-2.5 text-sm font-semibold disabled:opacity-30 ${role === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}
              >
                {roleLabel[r]}
              </button>
            ))}
          </div>
          {user && role !== user.role && <p className="mt-2 text-xs text-amber-700">Le changement de rôle déconnecte l'employé de ses appareils.</p>}
        </fieldset>
        {!user && <PinChoice mode={pinMode} onMode={setPinMode} pin={pin} onPin={setPin} />}
        <button disabled={saving} className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          {user ? "Enregistrer" : "Créer le profil"}
        </button>
      </form>
    </Modal>
  );
}

function PinResetForm({ user, isSelf, onClose, onDone }: { user: StaffUser | null; isSelf: boolean; onClose: () => void; onDone: (pin: string) => void }) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode("auto");
    setPin("");
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await api<{ pin: string }>(`/admin/users/${user.id}/pin`, {
        method: "PUT",
        body: JSON.stringify(mode === "manual" ? { pin } : {}),
      });
      onDone(res.pin);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={user !== null} onClose={onClose} title={`Nouveau code PIN — ${user?.name ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <PinChoice mode={mode} onMode={setMode} pin={pin} onPin={setPin} />
        {!isSelf && <p className="text-sm text-slate-500">L'ancien code ne fonctionnera plus et l'employé sera déconnecté de ses appareils.</p>}
        <button disabled={saving} className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-60">
          Réinitialiser le code
        </button>
      </form>
    </Modal>
  );
}

function PinReveal({ data, onClose }: { data: { name: string; pin: string } | null; onClose: () => void }) {
  return (
    <Modal open={data !== null} onClose={onClose} title={`Code PIN de ${data?.name ?? ""}`}>
      <div className="space-y-4 text-center">
        <div className="flex justify-center gap-2">
          {data?.pin.split("").map((d, i) => (
            <motion.span
              key={i}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              className="flex h-16 w-14 items-center justify-center rounded-xl bg-slate-900 font-mono text-3xl font-bold text-white"
            >
              {d}
            </motion.span>
          ))}
        </div>
        <p className="text-sm text-amber-800">Communiquez ce code à l'employé maintenant : il ne pourra plus être affiché.</p>
        <button onClick={onClose} className="w-full rounded-xl bg-brand-500 py-3 font-semibold text-white">
          C'est noté
        </button>
      </div>
    </Modal>
  );
}
