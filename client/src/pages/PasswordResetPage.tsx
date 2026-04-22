import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, requestPasswordReset } from "../lib/api";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import "../styles/facturacion.css";

const HASHRATE_LOGO = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";
type UiLang = "es" | "en" | "pt";

function normalizeUiLang(raw?: string | null): UiLang | null {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("pt")) return "pt";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";
  return null;
}

function resolveUiLang(raw?: string | null): UiLang {
  const explicit = normalizeUiLang(raw);
  if (explicit) return explicit;
  if (typeof navigator !== "undefined") {
    const n = normalizeUiLang(navigator.language || "");
    if (n) return n;
  }
  return "es";
}

export function PasswordResetPage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const token = (search.get("token") || "").trim();
  const resetSource = (search.get("source") || "").trim().toLowerCase();
  const uiLang = useMemo(() => resolveUiLang(search.get("lang")), [search]);
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
  const copy = useMemo(() => {
    if (uiLang === "en") {
      return {
        titleReset: "Reset your password",
        titleRecover: "Recover access",
        leadReset: "Enter your new password to complete the reset.",
        leadRecover: "We'll email you a link to create a new password.",
        emailRequired: "Enter your email.",
        sentFallback: "We sent a link to reset your password.",
        sendError: "Could not send the recovery email.",
        shortPassword: "Your password must be at least 6 characters.",
        mismatch: "Passwords do not match.",
        updated: "Password updated. You can sign in now.",
        resetError: "Could not reset your password.",
        labelEmail: "Account email",
        labelPass1: "New password",
        labelPass2: "Confirm new password",
        updating: "Updating...",
        sending: "Sending...",
        redirecting: "Redirecting to sign in...",
        saveNewPassword: "Save new password",
        sendLinkEmail: "Send reset link",
        backSgi: "Back to SGI login",
        backMarketplace: "Marketplace login",
      };
    }
    if (uiLang === "pt") {
      return {
        titleReset: "Redefinir sua senha",
        titleRecover: "Recuperar acesso",
        leadReset: "Digite sua nova senha para concluir a redefinicao.",
        leadRecover: "Enviaremos um link para criar uma nova senha.",
        emailRequired: "Informe seu e-mail.",
        sentFallback: "Enviamos um link para redefinir sua senha.",
        sendError: "Nao foi possivel enviar o e-mail de recuperacao.",
        shortPassword: "A senha deve ter pelo menos 6 caracteres.",
        mismatch: "As senhas nao coincidem.",
        updated: "Senha atualizada. Agora voce pode entrar.",
        resetError: "Nao foi possivel redefinir a senha.",
        labelEmail: "E-mail da conta",
        labelPass1: "Nova senha",
        labelPass2: "Confirmar nova senha",
        updating: "Atualizando...",
        sending: "Enviando...",
        redirecting: "Redirecionando para o login...",
        saveNewPassword: "Salvar nova senha",
        sendLinkEmail: "Enviar link por e-mail",
        backSgi: "Voltar ao login SGI",
        backMarketplace: "Login marketplace",
      };
    }
    return {
      titleReset: "Restablecer contraseña",
      titleRecover: "Recuperar acceso",
      leadReset: "Ingresá tu nueva contraseña para finalizar el restablecimiento.",
      leadRecover: "Te enviaremos un enlace para crear una nueva contraseña.",
      emailRequired: "Ingresá tu correo.",
      sentFallback: "Te enviamos un enlace para restablecer la contraseña.",
      sendError: "No se pudo enviar el correo de recuperación.",
      shortPassword: "La contraseña debe tener al menos 6 caracteres.",
      mismatch: "Las contraseñas no coinciden.",
      updated: "Contraseña actualizada. Ya podés iniciar sesión.",
      resetError: "No se pudo restablecer la contraseña.",
      labelEmail: "Correo de tu cuenta",
      labelPass1: "Nueva contraseña",
      labelPass2: "Confirmar nueva contraseña",
      updating: "Actualizando...",
      sending: "Enviando...",
      redirecting: "Redirigiendo al login...",
      saveNewPassword: "Guardar nueva contraseña",
      sendLinkEmail: "Enviar enlace por correo",
      backSgi: "Volver al login SGI",
      backMarketplace: "Login marketplace",
    };
  }, [uiLang]);

  const pageTitle = useMemo(
    () => (hasToken ? copy.titleReset : copy.titleRecover),
    [hasToken, copy]
  );

  useEffect(() => {
    if (!hasToken || !resetDone) return;
    const t = window.setTimeout(() => {
      const target = resetSource === "marketplace" ? "/marketplace/login" : "/login";
      navigate(target, { replace: true });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [hasToken, resetDone, navigate, resetSource]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setErrMsg("");
    setOkMsg("");
    if (!email.trim()) {
      setErrMsg(copy.emailRequired);
      return;
    }
    setBusy(true);
    try {
      const source = resetSource === "marketplace" || resetSource === "sgi" ? (resetSource as "marketplace" | "sgi") : undefined;
      const r = await requestPasswordReset(email.trim(), source, uiLang);
      setOkMsg(r.message || copy.sentFallback);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : copy.sendError);
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
      setErrMsg(copy.shortPassword);
      return;
    }
    if (password !== password2) {
      setErrMsg(copy.mismatch);
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setOkMsg(copy.updated);
      setResetDone(true);
      setPassword("");
      setPassword2("");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : copy.resetError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hrs-login-page">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-5 col-md-7">
            <div className="hrs-card hrs-auth-card p-4">
              <img src={HASHRATE_LOGO} alt="Hashrate Space" className="hrs-auth-logo" />
              <h2 className="hrs-title mb-3 text-center">{pageTitle}</h2>
              <p className="text-muted small text-center mb-4">
                {hasToken
                  ? copy.leadReset
                  : copy.leadRecover}
              </p>
              <form onSubmit={hasToken ? submitConfirm : submitRequest}>
                {!hasToken ? (
                  <div className="mb-3">
                    <label className="form-label">{copy.labelEmail}</label>
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
                      label={copy.labelPass1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <MarketplacePasswordField
                      label={copy.labelPass2}
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
                      ? copy.updating
                      : copy.sending
                    : resetDone
                      ? copy.redirecting
                    : hasToken
                      ? copy.saveNewPassword
                      : copy.sendLinkEmail}
                </button>
              </form>
              {(showSgiLoginLink || showMarketplaceLoginLink) && (
                <p className="text-center small text-muted mt-3 mb-0">
                  {showSgiLoginLink ? (
                    <Link to="/login" className="text-decoration-none">
                      {copy.backSgi}
                    </Link>
                  ) : null}
                  {showSgiLoginLink && showMarketplaceLoginLink ? <span className="mx-2">·</span> : null}
                  {showMarketplaceLoginLink ? (
                    <Link to="/marketplace/login" className="text-decoration-none">
                      {copy.backMarketplace}
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
