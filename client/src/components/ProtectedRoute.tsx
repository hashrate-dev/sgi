import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center min-vh-100" style={{ background: "linear-gradient(135deg, #074025 0%, #49f227 100%)" }}>
        <div className="spinner-border text-light mb-3" role="status" style={{ width: "3rem", height: "3rem" }}>
          <span className="visually-hidden">Cargando...</span>
        </div>
        <p className="text-white mb-0">Cargando...</p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // LECTOR solo puede ver Kryptex
  const path = location.pathname;
  const isKryptex = path === "/kryptex" || path.startsWith("/kryptex/");
  if (user.role === "lector" && !isKryptex) {
    return <Navigate to="/kryptex" replace />;
  }
  return <>{children}</>;
}
