import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { setApiBaseUrl } from "../lib/api";
import "../styles/facturacion.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const apiUrl = params.get("api");
    if (apiUrl && apiUrl.startsWith("http")) {
      setApiBaseUrl(apiUrl);
      window.history.replaceState({}, "", location.pathname + (location.hash || ""));
    }
  }, [location.search, location.pathname, location.hash]);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-4 col-md-6">
          <div className="hrs-card p-4">
            <h2 className="hrs-title mb-4 text-center">Iniciar sesión</h2>
            <p className="text-muted small text-center mb-4">Sistema de Facturación HRS</p>
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
              <div className="mb-3">
                <label className="form-label">Contraseña</label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <div className="alert alert-danger py-2 small" role="alert">
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
