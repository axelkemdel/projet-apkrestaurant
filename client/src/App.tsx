import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { restoreSession } from "./lib/session";
import { IdleLock } from "./components/IdleLock";
import { useAuth } from "./store/auth";
import { Login } from "./pages/Login";
import { ServerView } from "./pages/ServerView";
import { KitchenView } from "./pages/KitchenView";
import { CashierView } from "./pages/CashierView";
import { AdminView } from "./pages/AdminView";
import { Toaster } from "./components/Toasts";
import type { Role } from "./types";

/** Écran d'accueil par rôle. */
const homeByRole: Record<Role, string> = {
  SERVEUR: "/serveur",
  CUISINE: "/cuisine",
  CAISSE: "/caisse",
  ADMIN: "/admin",
};

function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN" && !roles.includes(user.role)) return <Navigate to={homeByRole[user.role]} replace />;
  return children;
}

export function App() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);

  // Au chargement : la session éventuelle est portée par le cookie HttpOnly, on la vérifie auprès du serveur
  useEffect(() => {
    void restoreSession();
  }, []);

  if (status === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={homeByRole[user.role]} replace /> : <Login />} />
        <Route
          path="/serveur"
          element={
            <Guard roles={["SERVEUR", "CAISSE"]}>
              <ServerView />
            </Guard>
          }
        />
        <Route
          path="/cuisine"
          element={
            <Guard roles={["CUISINE"]}>
              <KitchenView />
            </Guard>
          }
        />
        <Route
          path="/caisse"
          element={
            <Guard roles={["CAISSE"]}>
              <CashierView />
            </Guard>
          }
        />
        <Route
          path="/admin"
          element={
            <Guard roles={["ADMIN"]}>
              <AdminView />
            </Guard>
          }
        />
        <Route path="*" element={<Navigate to={user ? homeByRole[user.role] : "/login"} replace />} />
      </Routes>
      <IdleLock />
      <Toaster />
    </>
  );
}
