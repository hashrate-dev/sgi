import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext";
import { requestPasswordReset, wakeUpBackend } from "../lib/api";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";
import "../styles/facturacion.css";

const HASHRATE_LOGO = "https://hashrate.space/wp-content/uploads/hashrate-LOGO.png";

export function MarketplaceClienteLoginPage() {
  const { t, tf, lang } = useMarketplaceLang();
  const { user, loading, login, logout } = useAuth();
  const location = useLocation();
  const fromQuote = (location.state as { from?: string } | null)?.from === "quote";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [forgotMode, setForgotMode] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setReady(true), 25000);
    wakeUpBackend().finally(() => {
      clearTimeout(timeoutId);
      setReady(true);
    });
    return () => clearTimeout(timeoutId);
  }, []);

  if (!loading && user && canUseMarketplaceQuoteCart(user.role)) {
    return (
      <Navigate
        to="/marketplace"
        replace
        state={fromQuote ? { openQuoteDrawer: true } : undefined}
      />
    );
  }
  if (!loading && user && !canUseMarketplaceQuoteCart(user.role)) {
    /* Operador / lector: el carrito de cotización pide cuenta cliente o admin A/B */
    return (
      <div className="marketplace-asic-page">
        <div className="bg-mesh" aria-hidden />
        <div className="bg-grid" aria-hidden />
        <div id="app" data-page="marketplace-login-internal">
          <MarketplaceSiteHeader />
          <main id="page-main" className="page-main page-main--market page-main--market--asic">
            <section className="section section--market-shelf market-auth-section" style={{ maxWidth: 520, margin: "0 auto", padding: "2rem 1rem" }}>
              <p className="market-intro__desc mb-3">
                <Link to="/marketplace" className="text-decoration-underline">
                  {t("login.back_catalog")}
                </Link>
              </p>
              <h1 className="market-intro__kicker" style={{ marginBottom: "0.5rem" }}>
                {t("login.quote_title")}
              </h1>
              <p className="market-intro__desc mb-3">
                {tf("login.quote_blocked", {
                  email: user.email ?? user.username ?? "—",
                  role: String(user.role),
                  client: t("drawer.client"),
                  admin: t("drawer.admin"),
                })}
              </p>
              {fromQuote ? (
                <p className="market-intro__desc small mb-4" role="status">
                  {t("login.quote_hint_from")}
                </p>
              ) : (
                <p className="market-intro__desc small text-muted mb-4">
                  {t("login.quote_hint_other")}
                </p>
              )}
              <div className="hrs-card p-4 d-flex flex-column gap-2" style={{ borderRadius: 16, background: "rgba(255,255,255,0.92)" }}>
                <button type="button" className="btn btn-success w-100" onClick={() => logout()}>
                  {t("login.logout_switch")}
                </button>
                <Link to="/" className="btn btn-outline-secondary w-100">
                  {t("login.hrs_home")}
                </Link>
              </div>
            </section>
          </main>
          <MarketplaceSiteFooter />
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
        await wakeUpBackend();
      }
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.err_generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setResetMsg("");
    if (!email.trim()) {
      setError(t("login.forgot_email_required"));
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordReset(email.trim(), "marketplace", lang);
      // En el login no mostramos detalles sensibles (token/URL de desarrollo).
      setResetMsg(t("login.forgot_success"));
    } catch (err) {
      setResetMsg("");
      const raw = err instanceof Error ? err.message : t("login.forgot_err_start");
      const upper = raw.toUpperCase();
      const mailInvalid =
        upper.includes("MAIL INVALIDO") || upper.includes("INVALID EMAIL") || upper.includes("E-MAIL INVALID");
      setError(mailInvalid ? t("login.forgot_err_mail_invalid") : t("login.forgot_err_send"));
    } finally {
      setResetBusy(false);
    }
  }

  function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    void handleForgotPassword();
  }

  return (
    <div className="marketplace-asic-page marketplace-login-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-login">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className="section section--market-shelf market-login-page__section">
            <div className="container py-5">
              <div className="row justify-content-center">
                <div className="col-lg-5 col-md-7">
                  <div className="hrs-card hrs-auth-card p-4 market-login-page__form-card">
                    <img src={HASHRATE_LOGO} alt="Hashrate Space" className="hrs-auth-logo" />
                    <p className="text-muted text-center mb-4 hrs-auth-lead">
                      {forgotMode ? t("login.forgot_lead") : t("login.intro")}
                    </p>
                    <form onSubmit={forgotMode ? handleForgotPasswordSubmit : (e) => void handleSubmit(e)}>
                      <div className="mb-3">
                        <input
                          id="marketplace-login-user"
                          type="text"
                          className="form-control hrs-auth-input"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="username"
                          placeholder={t("login.user_label")}
                          aria-label={t("login.user_label")}
                          required
                        />
                      </div>
                      {!forgotMode ? (
                        <MarketplacePasswordField
                          label={t("login.password")}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          placeholder={t("login.password")}
                          inputClassName="form-control hrs-auth-input"
                          labelClassName="visually-hidden"
                          required
                        />
                      ) : null}
                      {!forgotMode ? (
                        <div className="d-flex justify-content-end mb-3">
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-decoration-none"
                            onClick={() => {
                              setError("");
                              setResetMsg("");
                              setForgotMode(true);
                            }}
                            disabled={resetBusy}
                          >
                            {t("login.forgot_password")}
                          </button>
                        </div>
                      ) : null}
                      {error ? (
                        <div className="alert alert-danger py-2 small" role="alert">
                          {error}
                        </div>
                      ) : null}
                      {resetMsg ? (
                        <div className="alert alert-success py-2 small" role="status">
                          {resetMsg}
                        </div>
                      ) : null}
                      <button
                        type="submit"
                        className="btn hrs-auth-continue-btn w-100"
                        disabled={forgotMode ? resetBusy : submitting || !ready}
                      >
                        {forgotMode
                          ? resetBusy
                            ? t("login.forgot_sending")
                            : t("login.forgot_send_link")
                          : !ready
                            ? t("login.preparing")
                            : submitting
                              ? t("login.entering")
                              : t("login.submit")}
                      </button>
                      {forgotMode ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary w-100 mt-2"
                          onClick={() => {
                            setError("");
                            setResetMsg("");
                            setForgotMode(false);
                          }}
                        >
                          {t("login.forgot_back")}
                        </button>
                      ) : null}
                    </form>
                    <p className="text-center small text-muted mt-3 mb-0">
                      <Link to="/marketplace" className="text-decoration-none">
                        <i className="bi bi-bag-heart me-1" aria-hidden />
                        {t("login.back_shop")}
                      </Link>
                    </p>
                    <p className="text-center small text-muted mt-2 mb-0">
                      {t("login.no_account")}{" "}
                      <Link to="/marketplace/signup" state={fromQuote ? { from: "quote" } : undefined}>
                        {t("login.register")}
                      </Link>
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
