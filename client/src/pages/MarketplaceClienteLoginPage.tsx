import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  requestPasswordReset,
  resendMarketplaceVerificationEmail,
  wakeUpBackend,
  isEmailNotVerifiedError,
} from "../lib/api";
import { isVercelOrPrimaryPublicHost } from "../lib/hashrateHosts";
import { RegistroAuthShell } from "../components/marketplace/RegistroAuthShell";
import { RegistroBrandPanel } from "../components/marketplace/RegistroBrandPanel";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";
import "../styles/facturacion.css";

export function MarketplaceClienteLoginPage() {
  const { t, lang } = useMarketplaceLang();
  const { user, loading, login } = useAuth();
  const location = useLocation();
  const fromQuote = (location.state as { from?: string } | null)?.from === "quote";
  const loginLinkState = fromQuote ? { from: "quote" as const } : undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [showUnverifiedResend, setShowUnverifiedResend] = useState(false);
  const [unverifiedResendBusy, setUnverifiedResendBusy] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setReady(true), 25000);
    wakeUpBackend().finally(() => {
      clearTimeout(timeoutId);
      setReady(true);
    });
    return () => clearTimeout(timeoutId);
  }, []);

  if (!loading && user) {
    return (
      <Navigate
        to="/equipment"
        replace
        state={fromQuote ? { openQuoteDrawer: true } : undefined}
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setShowUnverifiedResend(false);
    setSubmitting(true);
    try {
      if (typeof window !== "undefined" && isVercelOrPrimaryPublicHost(window.location.hostname)) {
        await wakeUpBackend();
      }
      await login(email.trim(), password);
    } catch (err) {
      if (isEmailNotVerifiedError(err)) {
        setShowUnverifiedResend(true);
      }
      setError(err instanceof Error ? err.message : t("login.err_generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendActivation() {
    if (!email.trim()) {
      setError(t("login.forgot_email_required"));
      return;
    }
    setUnverifiedResendBusy(true);
    setResetMsg("");
    try {
      const r = await resendMarketplaceVerificationEmail(email.trim(), lang);
      setResetMsg(r.message || t("login.unverified_resend_ok"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.forgot_err_send"));
    } finally {
      setUnverifiedResendBusy(false);
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

  const formTitle = forgotMode ? t("login.forgot_title") : t("login.form_title");
  const submitLabel = forgotMode
    ? resetBusy
      ? t("login.forgot_sending")
      : t("login.forgot_send_link")
    : !ready
      ? t("login.preparing")
      : submitting
        ? t("login.entering")
        : t("login.submit");

  return (
    <div className="marketplace-asic-page marketplace-registro-page marketplace-login-page marketplace-login-page--standalone">
      <div className="market-registro-page-bg" aria-hidden />
      <div id="app" data-page="marketplace-login">
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className="market-registro-section">
            <div className="container-fluid market-registro-shell px-3 px-sm-4 px-xl-5">
              <div className="row g-3 g-lg-4 align-items-stretch market-registro-layout-row market-registro-layout-row--split">
                <aside
                  className="col-lg-5 col-xl-4 d-none d-lg-flex market-registro-aside"
                  aria-label={t("login.aside_aria")}
                >
                  <RegistroBrandPanel variant="login" />
                </aside>

                <div className="col-12 col-lg-7 col-xl-8 market-registro-form-col">
                  <div className="market-registro-hero-compact d-lg-none">
                    <RegistroBrandPanel compact variant="login" />
                  </div>

                  <RegistroAuthShell mode="login" loginLinkState={loginLinkState}>
                    <div
                      className={`market-registro-card market-registro-card--auth market-registro-card--login${forgotMode ? " market-registro-card--login-forgot" : ""}`}
                    >
                      <header className="market-registro-card__head market-registro-card__head--auth">
                        <h2 className="market-registro-card__title">{formTitle}</h2>
                        {!forgotMode ? (
                          <p className="market-registro-card__desc mb-0">{t("login.intro")}</p>
                        ) : (
                          <p className="market-registro-card__desc mb-0">{t("login.forgot_lead")}</p>
                        )}
                      </header>

                      <form
                        className="market-registro-form"
                        onSubmit={forgotMode ? handleForgotPasswordSubmit : (e) => void handleSubmit(e)}
                        noValidate
                      >
                        <div
                          className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide"
                          role="group"
                          aria-labelledby="login-legend-cuenta"
                        >
                          <div id="login-legend-cuenta" className="market-registro-fieldset__legend">
                            <i className="bi bi-person-badge" aria-hidden />
                            {t("reg.legend_account")}
                          </div>

                          <div className="market-registro-field market-registro-email-wrap">
                            <label className="form-label market-registro-label" htmlFor="login-email">
                              {t("reg.email_label")}
                            </label>
                            <input
                              id="login-email"
                              type="email"
                              className="form-control"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              autoComplete="username email"
                              placeholder={t("reg.email_ph")}
                              required
                            />
                          </div>

                          {!forgotMode ? (
                            <>
                              <div className="market-registro-field">
                                <MarketplacePasswordField
                                  label={t("login.password")}
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  autoComplete="current-password"
                                  labelClassName="form-label market-registro-label"
                                  wrapperClassName="mb-0"
                                  required
                                />
                              </div>
                              <div className="market-registro-login-forgot">
                                <button
                                  type="button"
                                  className="btn btn-link btn-sm market-registro-login-forgot__btn"
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
                            </>
                          ) : null}
                        </div>

                        {error ? (
                          <div className="alert alert-danger py-2 small mb-3" role="alert" aria-live="polite">
                            {error}
                          </div>
                        ) : null}

                        {showUnverifiedResend && !forgotMode ? (
                          <button
                            type="button"
                            className="btn btn-outline-success w-100 mb-3"
                            disabled={unverifiedResendBusy}
                            onClick={() => void handleResendActivation()}
                          >
                            {unverifiedResendBusy ? t("login.unverified_resend_busy") : t("login.unverified_resend")}
                          </button>
                        ) : null}

                        {resetMsg ? (
                          <div className="alert alert-success py-2 small mb-3" role="status">
                            {resetMsg}
                          </div>
                        ) : null}

                        <div className="market-registro-submit-row market-registro-submit-row--auth">
                          <div className="market-registro-submit-row__cta">
                            {forgotMode ? (
                              <div className="market-registro-login-submit-group">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary market-registro-login-submit-group__back"
                                  onClick={() => {
                                    setError("");
                                    setResetMsg("");
                                    setForgotMode(false);
                                  }}
                                >
                                  {t("login.forgot_back")}
                                </button>
                                <button
                                  type="submit"
                                  className="btn btn-success market-registro-submit"
                                  disabled={resetBusy}
                                >
                                  {submitLabel}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="submit"
                                className="btn btn-success market-registro-submit"
                                disabled={submitting || !ready}
                              >
                                {submitLabel}
                              </button>
                            )}
                          </div>

                          <div className="market-registro-auth-footer-links market-registro-auth-footer-links--solo-back">
                            <Link
                              to="/equipment"
                              className="market-registro-auth-footer-links__back text-decoration-none"
                            >
                              <i className="bi bi-arrow-left-short me-1" aria-hidden />
                              {t("login.back_shop")}
                            </Link>
                          </div>
                        </div>
                      </form>
                    </div>
                  </RegistroAuthShell>
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
