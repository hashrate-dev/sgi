import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { useAuth } from "../contexts/AuthContext";
import { setApiBaseUrl, wakeUpBackend } from "../lib/api";
import "../styles/facturacion.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  // En Vercel: warmup (DB+app) antes de permitir login. En Render: health.
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 25000); // fallback: habilitar tras 25s
    wakeUpBackend().finally(() => {
      clearTimeout(t);
      setReady(true);
    });
    return () => clearTimeout(t);
  }, []);

  // Plan B (oculto): /login?api=URL guarda la URL del backend en localStorage; el usuario no ve nada.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const apiUrl = params.get("api");
    const host = window.location.hostname;
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");
    // Solo en entorno local permitimos override oculto de API.
    if (isLocalHost && apiUrl && apiUrl.startsWith("http")) {
      setApiBaseUrl(apiUrl);
      window.history.replaceState({}, "", location.pathname + (location.hash || ""));
    }
  }, [location.search, location.pathname, location.hash]);

  if (user) {
    const to = user.role === "lector" ? "/kryptex" : user.role === "cliente" ? "/marketplace" : "/";
    return <Navigate to={to} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (window.location.hostname.endsWith(".vercel.app")) {
        await wakeUpBackend();
      }
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="hrs-login-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-4 col-md-6">
            <div className="hrs-card p-4">
            <h2 className="hrs-title mb-4 text-center">Iniciar sesión</h2>
            <p className="text-muted small text-center mb-4">HRS Sistema de Gestión Interna</p>
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Usuario o correo</label>
                <input
                  type="text"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <MarketplacePasswordField
                label="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {error && (
                <div className="alert alert-danger py-2 small" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100" disabled={submitting || !ready}>
                {!ready ? "Preparando..." : submitting ? "Entrando..." : "Entrar"}
              </button>
            </form>
            <p className="text-center small text-muted mt-3 mb-0">
              <Link to="/marketplace" className="text-decoration-none">
                <i className="bi bi-bag-heart me-1" aria-hidden />
                Tienda online
              </Link>
            </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
