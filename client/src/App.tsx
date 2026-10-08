import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store/auth";
import { Login } from "./pages/Login";
import { ServerView } from "./pages/ServerView";
import { KitchenView } from "./pages/KitchenView";
import { Toaster } from "./components/Toasts";
import type { Role } from "./types";

/** Écran d'accueil par rôle (caisse et admin arrivent dans les prochaines étapes). */
const homeByRole: Record<Role, string> = {
  SERVEUR: "/serveur",
  CUISINE: "/cuisine",
  CAISSE: "/serveur",
  ADMIN: "/serveur",
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
        <Route path="*" element={<Navigate to={user ? homeByRole[user.role] : "/login"} replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
