import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/auth";
import { Login } from "./pages/Login";
import { ServerView } from "./pages/ServerView";
import { KitchenView } from "./pages/KitchenView";
import { CashierView } from "./pages/CashierView";
import { Toaster } from "./components/Toasts";
import type { Role } from "./types";

/** Écran d'accueil par rôle (le tableau de bord gérant arrive dans une prochaine étape). */
const homeByRole: Record<Role, string> = {
  SERVEUR: "/serveur",
  CUISINE: "/cuisine",
  CAISSE: "/caisse",
  ADMIN: "/caisse",
};

function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "ADMIN" && !roles.includes(user.role)) return <Navigate to={homeByRole[user.role]} replace />;
  return children;
}

export function App() {
  const user = useAuth((s) => s.user);
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
        <Route path="*" element={<Navigate to={user ? homeByRole[user.role] : "/login"} replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
