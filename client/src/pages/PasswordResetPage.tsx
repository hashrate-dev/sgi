import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, requestPasswordReset } from "../lib/api";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import "../styles/facturacion.css";

export function PasswordResetPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = (search.get("token") || "").trim();
  const resetSource = (search.get("source") || "").trim().toLowerCase();
  const hasToken = token.length > 0;
  const showSgiLoginLink = resetSource !== "marketplace";
  const showMarketplaceLoginLink = resetSource !== "sgi";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [resetDone, setResetDone] = useState(false);

  const pageTitle = useMemo(
    () => (hasToken ? "Restablecer contraseña" : "Recuperar acceso"),
    [hasToken]
  );

  useEffect(() => {
    if (!hasToken || !resetDone) return;
    const t = window.setTimeout(() => {
      navigate("/login", { replace: true });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [hasToken, resetDone, navigate]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg("");
    setOkMsg("");
    if (!email.trim()) {
      setErrMsg("Ingresá tu correo.");
      return;
    }
    setBusy(true);
    try {
      const r = await requestPasswordReset(email.trim());
      setOkMsg(r.message || "Te enviamos un enlace para restablecer la contraseña.");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "No se pudo enviar el correo de recuperación.");
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg("");
    setOkMsg("");
    setResetDone(false);
    if (password.length < 6) {
      setErrMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setErrMsg("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setOkMsg("Contraseña actualizada. Ya podés iniciar sesión.");
      setResetDone(true);
      setPassword("");
      setPassword2("");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hrs-login-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-5 col-md-7">
            <div className="hrs-card p-4">
              <h2 className="hrs-title mb-3 text-center">{pageTitle}</h2>
              <p className="text-muted small text-center mb-4">
                {hasToken
                  ? "Ingresá tu nueva contraseña para finalizar el restablecimiento."
                  : "Te enviaremos un enlace para crear una nueva contraseña."}
              </p>
              <form onSubmit={hasToken ? submitConfirm : submitRequest}>
                {!hasToken ? (
                  <div className="mb-3">
                    <label className="form-label">Correo de tu cuenta</label>
                    <input
                      type="email"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                ) : (
                  <>
                    <MarketplacePasswordField
                      label="Nueva contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <MarketplacePasswordField
                      label="Confirmar nueva contraseña"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </>
                )}
                {errMsg ? (
                  <div className="alert alert-danger py-2 small" role="alert">
                    {errMsg}
                  </div>
                ) : null}
                {okMsg ? (
                  <div className="alert alert-success py-2 small" role="status">
                    {okMsg}
                  </div>
                ) : null}
                <button type="submit" className="btn btn-primary w-100" disabled={busy || resetDone}>
                  {busy
                    ? hasToken
                      ? "Actualizando..."
                      : "Enviando..."
                    : resetDone
                      ? "Redirigiendo al login..."
                    : hasToken
                      ? "Guardar nueva contraseña"
                      : "Enviar enlace por correo"}
                </button>
              </form>
              {(showSgiLoginLink || showMarketplaceLoginLink) && (
                <p className="text-center small text-muted mt-3 mb-0">
                  {showSgiLoginLink ? (
                    <Link to="/login" className="text-decoration-none">
                      Volver al login SGI
                    </Link>
                  ) : null}
                  {showSgiLoginLink && showMarketplaceLoginLink ? <span className="mx-2">·</span> : null}
                  {showMarketplaceLoginLink ? (
                    <Link to="/marketplace/login" className="text-decoration-none">
                      Login marketplace
                    </Link>
                  ) : null}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
