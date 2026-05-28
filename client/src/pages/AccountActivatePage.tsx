import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resendMarketplaceVerificationEmail, verifyMarketplaceEmail } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { HASHRATE_SPACE_LOGO } from "../lib/marketplaceWpAssets.js";
import "../styles/marketplace-hashrate.css";
import "../styles/facturacion.css";

type UiLang = "es" | "en" | "pt";

function resolveUiLang(raw?: string | null): UiLang {
  const v = String(raw || "").trim().toLowerCase();
  if (v.startsWith("pt")) return "pt";
  if (v.startsWith("en")) return "en";
  return "es";
}

export function AccountActivatePage() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { applyLoginResponse } = useAuth();
  const token = (search.get("token") || "").trim();
  const uiLang = useMemo(() => resolveUiLang(search.get("lang")), [search]);
  const [busy, setBusy] = useState(!!token);
  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendOk, setResendOk] = useState("");

  const copy = useMemo(() => {
    if (uiLang === "en") {
      return {
        title: "Activate your account",
        lead: "We are confirming your email address.",
        noToken: "Open the activation link we sent to your email.",
        success: "Account activated. Redirecting…",
        fail: "Could not activate your account.",
        resendLabel: "Resend activation email",
        resendEmailPh: "your@email.com",
        resendBusy: "Sending…",
        resendOk: "If your account is pending, we sent a new link.",
        login: "Sign in",
        shop: "Back to shop",
      };
    }
    if (uiLang === "pt") {
      return {
        title: "Ative sua conta",
        lead: "Estamos confirmando seu endereço de e-mail.",
        noToken: "Abra o link de ativação que enviamos ao seu e-mail.",
        success: "Conta ativada. Redirecionando…",
        fail: "Não foi possível ativar sua conta.",
        resendLabel: "Reenviar e-mail de ativação",
        resendEmailPh: "seu@email.com",
        resendBusy: "Enviando…",
        resendOk: "Se sua conta estiver pendente, enviamos um novo link.",
        login: "Entrar",
        shop: "Voltar à loja",
      };
    }
    return {
      title: "Activá tu cuenta",
      lead: "Estamos confirmando tu correo electrónico.",
      noToken: "Abrí el enlace de activación que te enviamos por correo.",
      success: "Cuenta activada. Redirigiendo…",
      fail: "No se pudo activar tu cuenta.",
      resendLabel: "Reenviar correo de activación",
      resendEmailPh: "tu@correo.com",
      resendBusy: "Enviando…",
      resendOk: "Si tu cuenta está pendiente, te enviamos un nuevo enlace.",
      login: "Iniciar sesión",
      shop: "Volver a la tienda",
    };
  }, [uiLang]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErrMsg("");
      try {
        const res = await verifyMarketplaceEmail(token);
        if (cancelled) return;
        applyLoginResponse(res);
        setOkMsg(res.message || copy.success);
        window.setTimeout(() => {
          navigate("/equipment", { replace: true });
        }, 1400);
      } catch (err) {
        if (cancelled) return;
        setErrMsg(err instanceof Error ? err.message : copy.fail);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applyLoginResponse, navigate, copy.success, copy.fail]);

  async function submitResend(e: React.FormEvent) {
    e.preventDefault();
    setResendOk("");
    setErrMsg("");
    const email = resendEmail.trim();
    if (!email) return;
    setResendBusy(true);
    try {
      const r = await resendMarketplaceVerificationEmail(email, uiLang);
      setResendOk(r.message || copy.resendOk);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : copy.fail);
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div className="marketplace-asic-page">
      <div id="app">
        <MarketplaceSiteHeader />
        <main className="page-main page-main--market page-main--market--asic">
          <section className="py-5">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-6 col-md-8">
                  <div className="market-registro-card p-4 p-md-5 text-center">
                    <img src={HASHRATE_SPACE_LOGO} alt="Hashrate Space" className="hrs-auth-logo mb-3" />
                    <h1 className="h3 mb-2">{copy.title}</h1>
                    <p className="text-muted mb-4">{token ? copy.lead : copy.noToken}</p>
                    {busy ? (
                      <p className="text-muted" role="status">
                        {copy.lead}
                      </p>
                    ) : null}
                    {okMsg ? (
                      <div className="alert alert-success py-2 small" role="status">
                        {okMsg}
                      </div>
                    ) : null}
                    {errMsg ? (
                      <div className="alert alert-danger py-2 small" role="alert">
                        {errMsg}
                      </div>
                    ) : null}
                    {!token ? (
                      <form onSubmit={(e) => void submitResend(e)} className="text-start mt-3">
                        <label className="form-label small">{copy.resendLabel}</label>
                        <input
                          type="email"
                          className="form-control mb-2"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          placeholder={copy.resendEmailPh}
                          autoComplete="email"
                          required
                        />
                        {resendOk ? (
                          <div className="alert alert-success py-2 small" role="status">
                            {resendOk}
                          </div>
                        ) : null}
                        <button type="submit" className="btn btn-success w-100" disabled={resendBusy}>
                          {resendBusy ? copy.resendBusy : copy.resendLabel}
                        </button>
                      </form>
                    ) : null}
                    <p className="small text-muted mt-4 mb-0">
                      <Link to="/acceso">{copy.login}</Link>
                      <span className="mx-2">·</span>
                      <Link to="/equipment">{copy.shop}</Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
        <MarketplaceSiteFooter />
      </div>
    </div>
  );
}
