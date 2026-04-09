import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center min-vh-100" style={{ background: "linear-gradient(135deg, #074025 0%, #49f227 100%)" }}>
        <div className="spinner-border text-light" role="status" aria-label="Espere un momento" style={{ width: "3rem", height: "3rem" }} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.role === "cliente") {
    return <Navigate to="/marketplace" replace />;
  }
  // LECTOR solo puede ver Kryptex
  const path = location.pathname;
  const isKryptex = path === "/kryptex" || path.startsWith("/kryptex/");
  if (user.role === "lector" && !isKryptex) {
    return <Navigate to="/kryptex" replace />;
  }
  return <>{children}</>;
}
