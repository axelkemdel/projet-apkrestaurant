import { useCallback, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AUTO_LOGOUT, autoLogoutApplies, logout, restoreSession } from "./lib/session";
import { refreshSession } from "./lib/api";
import { useAutoLogout } from "./hooks/useAutoLogout";
import { InactivityModal } from "./components/InactivityModal";
import i18n from "./i18n";
import { IdleLock } from "./components/IdleLock";
import { useAuth } from "./store/auth";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HOME_BY_ROLE, ROUTE_ROLES } from "./lib/roles";
import { ServerView } from "./pages/ServerView";
import { KitchenView } from "./pages/KitchenView";
import { CashierView } from "./pages/CashierView";
import { AdminView } from "./pages/AdminView";
import { CustomerTableDashboard } from "./pages/CustomerTableDashboard";
import { toast, Toaster } from "./components/Toasts";
import { ServerNotConfigured } from "./components/ServerNotConfigured";
import { applyOrientation, initNative, isBundledWithoutServer, redirectingToServer } from "./lib/native";


export function App() {
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const { pathname } = useLocation();
  // Portail client (QR code) : public, sans session ni verrouillage d'écran
  const isGuest = pathname.startsWith("/qr/");

  // Au chargement : la session éventuelle est portée par le cookie HttpOnly, on la vérifie auprès du serveur
  useEffect(() => {
    if (!isGuest && !isBundledWithoutServer && !redirectingToServer) void restoreSession();
  }, [isGuest]);

  // Application Android : barre d'état, clavier, et paysage imposé pour la caisse et la cuisine
  useEffect(() => void initNative(), []);
  useEffect(() => void applyOrientation(pathname), [pathname]);

  if (isBundledWithoutServer) return <ServerNotConfigured />;
  if (redirectingToServer) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (isGuest) {
    return (
      <>
        <Routes>
          <Route path="/qr/:token" element={<CustomerTableDashboard />} />
        </Routes>
        <Toaster />
      </>
    );
  }

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
        <Route path="/login" element={user ? <Navigate to={HOME_BY_ROLE[user.role]} replace /> : <LoginPage />} />
        {/* Écrans par rôle (RBAC) — l'API revérifie chaque appel */}
        <Route
          path="/pos/tables"
          element={
            <ProtectedRoute roles={ROUTE_ROLES.pos}>
              <ServerView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kds/kitchen"
          element={
            <ProtectedRoute roles={ROUTE_ROLES.kds}>
              <KitchenView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cashier/checkout"
          element={
            <ProtectedRoute roles={ROUTE_ROLES.cashier}>
              <CashierView />
            </ProtectedRoute>
          }
        />
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route
          path="/admin/:section"
          element={
            <ProtectedRoute roles={ROUTE_ROLES.admin}>
              <AdminView />
            </ProtectedRoute>
          }
        />
        {/* Anciennes adresses (favoris des tablettes) */}
        <Route path="/serveur" element={<Navigate to="/pos/tables" replace />} />
        <Route path="/cuisine" element={<Navigate to="/kds/kitchen" replace />} />
        <Route path="/caisse" element={<Navigate to="/cashier/checkout" replace />} />
        <Route path="*" element={<Navigate to={user ? HOME_BY_ROLE[user.role] : "/login"} replace />} />
      </Routes>
      <IdleLock />
      <AutoLogoutGuard />
      <Toaster />
    </>
  );
}

/**
 * Déconnexion automatique pour inactivité, sur tous les écrans du personnel connectés
 * (sauf écran cuisine) : avertissement après 4 min, déconnexion 60 s plus tard.
 */
function AutoLogoutGuard() {
  const user = useAuth((s) => s.user);
  const locked = useAuth((s) => s.locked);
  const navigate = useNavigate();

  const endSession = useCallback(
    async (reason: "idle" | "manual") => {
      await logout(); // POST /api/auth/logout, état local, temps réel et panier nettoyés
      navigate("/login", { replace: true });
      if (reason === "idle") toast.info(i18n.t("session.expiredIdle"));
    },
    [navigate],
  );

  const { warningOpen, secondsLeft, stayActive } = useAutoLogout({
    enabled: Boolean(user && !locked && autoLogoutApplies(user.role)),
    warnAfterMs: AUTO_LOGOUT.warnAfterMs,
    countdownSeconds: AUTO_LOGOUT.countdownSeconds,
    onTimeout: () => void endSession("idle"),
  });

  return (
    <InactivityModal
      open={warningOpen}
      secondsLeft={secondsLeft}
      totalSeconds={AUTO_LOGOUT.countdownSeconds}
      onStay={() => {
        stayActive();
        // Prolonge aussi la session côté serveur
        void refreshSession();
      }}
      onLogout={() => void endSession("manual")}
    />
  );
}
