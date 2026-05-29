import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { MARKETPLACE } from "../lib/marketplacePaths.js";
import { useAuth } from "../contexts/AuthContext";
import { isEmailAlreadyRegisteredError, isRegisterPendingVerification, registerMarketplaceCliente, resendMarketplaceVerificationEmail, wakeUpBackend } from "../lib/api";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { RegistroAuthShell } from "../components/marketplace/RegistroAuthShell";
import { RegistroBrandPanel } from "../components/marketplace/RegistroBrandPanel";
import { RegistroCountrySelect } from "../components/marketplace/RegistroCountrySelect";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";
import {
  CITY_OTHER_VALUE,
  COUNTRIES_REGISTRO,
  countryById,
  normalizeLocalPhoneInput,
  sortCountriesRegistroByName,
} from "../lib/marketplaceRegistroGeo";
import {
  COMMON_EMAIL_DOMAINS,
  filterEmailDomainSuggestions,
  splitEmailLocalAndDomain,
} from "../lib/emailDomainSuggestions";
import { marketplaceLocale } from "../lib/i18n.js";
import "../styles/facturacion.css";

/** Prefijo telefónico por defecto al cargar el registro (Paraguay +595). */
const DEFAULT_PHONE_DIAL_COUNTRY_ID = "PY";

/** Registro tienda: layout amplio + branding HASHRATE SPACE (alineado con `/marketplace/login`). */
export function MarketplaceClienteRegistroPage() {
  const { lang, t } = useMarketplaceLang();
  const { user, loading, applyLoginResponse } = useAuth();
  const location = useLocation();
  const fromQuote = (location.state as { from?: string } | null)?.from === "quote";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [countryId, setCountryId] = useState("");
  const [city, setCity] = useState("");
  const [cityOther, setCityOther] = useState("");
  /** País asociado al prefijo E.164 (independiente del país de dirección; se sincroniza con él al cambiar). */
  const [celularDialId, setCelularDialId] = useState(DEFAULT_PHONE_DIAL_COUNTRY_ID);
  const [celularLocal, setCelularLocal] = useState("");
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<"client" | "duplicate" | "generic">("client");
  const [duplicateReason, setDuplicateReason] = useState<"email" | "other">("other");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [emailSuggestFocus, setEmailSuggestFocus] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [pendingVerificationMessage, setPendingVerificationMessage] = useState("");
  const [resendActivationBusy, setResendActivationBusy] = useState(false);
  const [resendActivationMsg, setResendActivationMsg] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 25000);
    wakeUpBackend().finally(() => {
      clearTimeout(t);
      setReady(true);
    });
    return () => clearTimeout(t);
  }, []);

  const paisSeleccionado = countryById(countryId);

  const countriesSorted = useMemo(
    () => sortCountriesRegistroByName(COUNTRIES_REGISTRO, marketplaceLocale(lang)),
    [lang]
  );

  const { local: emailLocal, domainFragment: emailDomainFrag } = splitEmailLocalAndDomain(email);
  const emailDomainSuggestions = useMemo(
    () => filterEmailDomainSuggestions(emailDomainFrag, 10),
    [emailDomainFrag],
  );
  const emailHasExactDomain =
    email.includes("@") &&
    COMMON_EMAIL_DOMAINS.some((d) => d.toLowerCase() === emailDomainFrag.toLowerCase() && emailDomainFrag.length > 0);
  const showEmailDomainSuggest =
    emailSuggestFocus &&
    email.includes("@") &&
    emailLocal.length > 0 &&
    !emailHasExactDomain &&
    emailDomainSuggestions.length > 0;

  const duplicateHeading = duplicateReason === "email" ? t("reg.dup_heading") : "No se pudo crear la cuenta";
  const duplicateDetailMessage =
    duplicateReason === "email" ? "Este email ya se está utilizando en el sistema." : error;

  const loginLinkState = fromQuote ? { from: "quote" as const } : undefined;

  function applyEmailDomain(domain: string) {
    const base = emailLocal.trim();
    if (!base) return;
    setEmail(`${base}@${domain}`);
    setEmailSuggestFocus(false);
  }

  /** Ciudad según país de ubicación (al cambiar país o al sincronizar desde prefijo). */
  function applyCityForCountry(id: string) {
    setCityOther("");
    if (!id) {
      setCity("");
      return;
    }
    const pais = countryById(id);
    setCity(pais && pais.cities.length === 0 ? CITY_OTHER_VALUE : "");
  }

  /** País de ubicación → actualiza prefijo; el usuario puede cambiar el prefijo después. */
  function handleCountryChange(id: string) {
    setCountryId(id);
    if (id) {
      setCelularDialId(id);
    }
    applyCityForCountry(id);
  }

  /**
   * Prefijo → país solo si aún no eligió país (p. ej. prefijo primero).
   * Si ya hay país distinto, no se pisa (celular de otro país).
   */
  function handleCelularDialChange(id: string) {
    setCelularDialId(id);
    if (!id || countryId) return;
    setCountryId(id);
    applyCityForCountry(id);
  }

  if (!loading && user) {
    return (
      <Navigate
        to="/equipment"
        replace
        state={fromQuote ? { openQuoteDrawer: true } : undefined}
      />
    );
  }

  function showRegistrationPendingVerification(emailAddr: string, message?: string) {
    setPendingVerificationEmail(emailAddr.trim().toLowerCase());
    setPendingVerificationMessage(message?.trim() || "");
    setResendActivationMsg("");
    setError("");
    setSubmitting(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleResendActivationEmail() {
    if (!pendingVerificationEmail) return;
    setResendActivationBusy(true);
    setResendActivationMsg("");
    try {
      const r = await resendMarketplaceVerificationEmail(pendingVerificationEmail, lang);
      setResendActivationMsg(r.message || t("reg.verify_resend_ok"));
    } catch (err) {
      setResendActivationMsg(err instanceof Error ? err.message : t("reg.verify_resend_fail"));
    } finally {
      setResendActivationBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorKind("client");
    setDuplicateReason("other");
    if (password.length < 6) {
      setErrorKind("client");
      setError(t("reg.err.password_short"));
      return;
    }
    if (password !== password2) {
      setErrorKind("client");
      setError(t("reg.err.password_mismatch"));
      return;
    }
    const nombreTrim = nombre.trim();
    const apellidosTrim = apellidos.trim();
    if (nombreTrim.length < 1) {
      setErrorKind("client");
      setError(t("reg.err.nombre"));
      return;
    }
    if (apellidosTrim.length < 1) {
      setErrorKind("client");
      setError(t("reg.err.apellidos"));
      return;
    }
    if (!countryId) {
      setErrorKind("client");
      setError(t("reg.err.country"));
      return;
    }
    const pais = countryById(countryId);
    if (!pais) {
      setErrorKind("client");
      setError(t("reg.err.country_bad"));
      return;
    }
    if (!city) {
      setErrorKind("client");
      setError(t("reg.err.city"));
      return;
    }
    const cityFinal = city === CITY_OTHER_VALUE ? cityOther.trim() : city.trim();
    if (!cityFinal || cityFinal.length < 2) {
      setErrorKind("client");
      setError(city === CITY_OTHER_VALUE ? t("reg.err.city_other") : t("reg.err.city"));
      return;
    }
    if (!celularDialId) {
      setErrorKind("client");
      setError(t("reg.err.dial"));
      return;
    }
    const paisCel = countryById(celularDialId);
    if (!paisCel) {
      setErrorKind("client");
      setError(t("reg.err.dial_bad"));
      return;
    }
    const dialCel = paisCel.dial;
    const celDigits = normalizeLocalPhoneInput(celularLocal, dialCel);
    if (celDigits.length < 6) {
      setErrorKind("client");
      setError(t("reg.err.phone"));
      return;
    }
    const celularFull = `${dialCel}${celDigits}`;
    setSubmitting(true);
    try {
      if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
        await wakeUpBackend();
      }
      const res = await registerMarketplaceCliente({
        email: email.trim(),
        password,
        nombre: nombreTrim,
        apellidos: apellidosTrim,
        country: pais.name,
        city: cityFinal,
        celular: celularFull,
        lang,
      });
      if (isRegisterPendingVerification(res)) {
        showRegistrationPendingVerification(res.email, res.message);
        return;
      }
      if ("user" in res && res.user) {
        applyLoginResponse(res);
      }
    } catch (err) {
      const isDupEmail = isEmailAlreadyRegisteredError(err);
      if (isDupEmail) {
        setErrorKind("duplicate");
        setDuplicateReason("email");
        setError(err instanceof Error ? err.message : t("reg.err.duplicate_fallback"));
      } else {
        setErrorKind("generic");
        setDuplicateReason("other");
        setError(err instanceof Error ? err.message : t("reg.err.register_fail"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="marketplace-asic-page marketplace-registro-page marketplace-login-page--standalone">
      <div className="market-registro-page-bg" aria-hidden />
      <div id="app" data-page="marketplace-registro">
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className="market-registro-section">
            <div className="container-fluid market-registro-shell px-3 px-sm-4 px-xl-5">
              <div className="row g-3 g-lg-4 align-items-stretch market-registro-layout-row market-registro-layout-row--split">
                <aside
                  className="col-lg-5 col-xl-4 d-none d-lg-flex market-registro-aside"
                  aria-label={t("reg.aside_aria")}
                >
                  <div className="market-registro-aside-inner">
                    <RegistroBrandPanel />
                  </div>
                </aside>

                <div className="col-12 col-lg-7 col-xl-8 market-registro-form-col">
                  {pendingVerificationEmail ? (
                    <>
                      <div className="market-registro-hero-compact d-lg-none">
                        <RegistroBrandPanel compact />
                      </div>

                      <RegistroAuthShell mode="signup" loginLinkState={loginLinkState}>
                      <div className="market-registro-card market-registro-success-card" role="status">
                        <div className="market-registro-success-card__body">
                      <div className="market-registro-success-card__icon" aria-hidden>
                        <i className="bi bi-envelope-check-fill" />
                      </div>
                      <h1 className="market-registro-success-card__title">{t("reg.verify_success_title")}</h1>
                      <p className="market-registro-success-card__lead">{t("reg.verify_success_lead")}</p>
                      <p className="market-registro-success-card__email">
                        <span className="text-muted">{t("reg.verify_success_sent_to")}</span>
                        <strong>{pendingVerificationEmail}</strong>
                      </p>
                      {pendingVerificationMessage ? (
                        <p className="market-registro-success-card__server-msg">{pendingVerificationMessage}</p>
                      ) : null}
                      <ol className="market-registro-success-card__steps" aria-label={t("reg.verify_steps_aria")}>
                        {[
                          { icon: "bi-inbox-fill", text: t("reg.verify_step1") },
                          { icon: "bi-envelope-open-fill", text: t("reg.verify_step2") },
                          { icon: "bi-patch-check-fill", text: t("reg.verify_step3") },
                        ].map((step, index) => (
                          <li key={index} className="market-registro-success-card__step">
                            <div className="market-registro-success-card__step-marker" aria-hidden>
                              <span className="market-registro-success-card__step-num">{index + 1}</span>
                              <i className={`bi ${step.icon} market-registro-success-card__step-icon`} />
                            </div>
                            <p className="market-registro-success-card__step-text">{step.text}</p>
                          </li>
                        ))}
                      </ol>
                      <p className="market-registro-success-card__hint">{t("reg.verify_pending_hint")}</p>
                      {resendActivationMsg ? (
                        <div className="alert alert-success py-2 small mb-3" role="status">
                          {resendActivationMsg}
                        </div>
                      ) : null}
                      <div className="market-registro-success-card__actions">
                        <button
                          type="button"
                          className="btn btn-success"
                          disabled={resendActivationBusy}
                          onClick={() => void handleResendActivationEmail()}
                        >
                          {resendActivationBusy ? t("reg.verify_resend_busy") : t("reg.verify_resend_btn")}
                        </button>
                        <Link to={MARKETPLACE.clientLogin} className="btn btn-outline-secondary">
                          {t("reg.login_link")}
                        </Link>
                        <Link to="/equipment" className="btn btn-link text-decoration-none">
                          {t("reg.back_shop")}
                        </Link>
                      </div>
                        </div>
                    </div>
                      </RegistroAuthShell>
                    </>
                  ) : (
                    <>
                  <div className="market-registro-hero-compact d-lg-none">
                    <RegistroBrandPanel compact />
                  </div>

                  <RegistroAuthShell mode="signup" loginLinkState={loginLinkState}>
                  <div className="market-registro-card market-registro-card--auth">
                    <header className="market-registro-card__head market-registro-card__head--auth">
                      <h2 className="market-registro-card__title">{t("reg.form_title")}</h2>
                      <p className="market-registro-card__desc mb-0">{t("reg.form_subtitle")}</p>
                    </header>

                    <form className="market-registro-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
                      <div
                        className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide"
                        role="group"
                        aria-labelledby="reg-legend-cuenta"
                      >
                        <div id="reg-legend-cuenta" className="market-registro-fieldset__legend">
                          <i className="bi bi-person-badge" aria-hidden />
                          {t("reg.legend_account")}
                        </div>
                        <div className="mb-3 market-registro-email-wrap">
                          <label className="form-label market-registro-label" htmlFor="reg-email">
                            {t("reg.email_label")}
                          </label>
                          <div className="position-relative">
                            <input
                              id="reg-email"
                              type="email"
                              className="form-control"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onFocus={() => setEmailSuggestFocus(true)}
                              onBlur={() => {
                                window.setTimeout(() => setEmailSuggestFocus(false), 180);
                              }}
                              autoComplete="email"
                              placeholder={t("reg.email_ph")}
                              aria-autocomplete="list"
                              aria-controls="reg-email-domain-listbox"
                              aria-expanded={showEmailDomainSuggest}
                              required
                            />
                            {showEmailDomainSuggest ? (
                              <ul
                                id="reg-email-domain-listbox"
                                className="market-registro-email-suggest list-unstyled mb-0"
                                role="listbox"
                              >
                                {emailDomainSuggestions.map((d) => (
                                  <li key={d} role="option">
                                    <button
                                      type="button"
                                      className="market-registro-email-suggest__btn"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => applyEmailDomain(d)}
                                    >
                                      <span className="text-body-secondary">{emailLocal}@</span>
                                      <strong>{d}</strong>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </div>
                        <div className="row g-3 market-registro-password-row">
                          <div className="col-sm-6">
                            <MarketplacePasswordField
                              label={t("reg.pw_min")}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="new-password"
                              labelClassName="form-label market-registro-label"
                              wrapperClassName="mb-0"
                              required
                            />
                          </div>
                          <div className="col-sm-6">
                            <MarketplacePasswordField
                              label={t("reg.pw_confirm")}
                              value={password2}
                              onChange={(e) => setPassword2(e.target.value)}
                              autoComplete="new-password"
                              labelClassName="form-label market-registro-label"
                              wrapperClassName="mb-0"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="row g-3 market-registro-split-xl align-items-stretch">
                        <div className="col-12 col-xl-6 d-flex">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                            role="group"
                            aria-labelledby="reg-legend-personal"
                          >
                            <div id="reg-legend-personal" className="market-registro-fieldset__legend">
                              <i className="bi bi-person-vcard" aria-hidden />
                              {t("reg.legend_personal")}
                            </div>
                            <div className="market-registro-personal-fields">
                              <div className="market-registro-field market-registro-field--field-icon market-registro-field--icon-name">
                                <label className="form-label market-registro-label" htmlFor="reg-nombre">
                                  {t("reg.label_nombre")}
                                </label>
                                <input
                                  id="reg-nombre"
                                  type="text"
                                  className="form-control"
                                  value={nombre}
                                  onChange={(e) => setNombre(e.target.value)}
                                  autoComplete="given-name"
                                  placeholder={t("reg.ph_nombre")}
                                  required
                                />
                              </div>
                              <div className="market-registro-field market-registro-field--field-icon market-registro-field--icon-surname">
                                <label className="form-label market-registro-label" htmlFor="reg-apellidos">
                                  {t("reg.label_apellidos")}
                                </label>
                                <input
                                  id="reg-apellidos"
                                  type="text"
                                  className="form-control"
                                  value={apellidos}
                                  onChange={(e) => setApellidos(e.target.value)}
                                  autoComplete="family-name"
                                  placeholder={t("reg.ph_apellidos")}
                                  required
                                />
                              </div>
                              <div className="market-registro-field market-registro-field--phone-row">
                                <div className="market-registro-phone-row">
                                  <div className="market-registro-phone-row__dial">
                                    <label className="form-label market-registro-label" htmlFor="reg-cel-dial">
                                      {t("reg.label_dial_short")}
                                    </label>
                                    <RegistroCountrySelect
                                      id="reg-cel-dial"
                                      className="w-100"
                                      value={celularDialId}
                                      onChange={handleCelularDialChange}
                                      countries={countriesSorted}
                                      allowEmpty={false}
                                      compactDisplay
                                      aria-label={t("reg.dial_aria")}
                                      required
                                    />
                                  </div>
                                  <div className="market-registro-phone-row__num market-registro-field--field-icon market-registro-field--icon-phone">
                                    <label className="form-label market-registro-label" htmlFor="reg-cel-num">
                                      {t("reg.label_mobile")}
                                    </label>
                                    <input
                                      id="reg-cel-num"
                                      type="tel"
                                      className="form-control"
                                      value={celularLocal}
                                      onChange={(e) => setCelularLocal(e.target.value)}
                                      autoComplete="tel-national"
                                      placeholder={t("reg.phone_ph")}
                                      inputMode="numeric"
                                      required
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="col-12 col-xl-6 d-flex">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 flex-grow-1 w-100"
                            role="group"
                            aria-labelledby="reg-legend-ubicacion"
                          >
                            <div id="reg-legend-ubicacion" className="market-registro-fieldset__legend">
                              <i className="bi bi-geo-alt" aria-hidden />
                              {t("reg.legend_ship")}
                            </div>
                            <div className="market-registro-pais-fields">
                              <div className="market-registro-field market-registro-field--field-icon market-registro-field--icon-globe">
                                <label className="form-label market-registro-label" htmlFor="reg-pais">
                                  {t("reg.label_country")}
                                </label>
                                <RegistroCountrySelect
                                  id="reg-pais"
                                  className="w-100"
                                  value={countryId}
                                  onChange={handleCountryChange}
                                  countries={countriesSorted}
                                  placeholder={t("reg.country_placeholder")}
                                  aria-label={t("reg.label_country")}
                                  required
                                />
                              </div>
                              <div className="market-registro-field market-registro-field--field-icon market-registro-field--icon-city">
                                <label className="form-label market-registro-label" htmlFor="reg-ciudad">
                                  {t("reg.label_city")}
                                </label>
                                <select
                                  id="reg-ciudad"
                                  className="form-select"
                                  value={city}
                                  onChange={(e) => setCity(e.target.value)}
                                  autoComplete="address-level2"
                                  aria-label={t("reg.label_city")}
                                  disabled={!paisSeleccionado}
                                  required
                                >
                                  <option value="">
                                    {paisSeleccionado ? t("reg.city_pick") : t("reg.city_need_country")}
                                  </option>
                                  {paisSeleccionado?.cities.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                  {paisSeleccionado ? (
                                    <option value={CITY_OTHER_VALUE}>{t("reg.city_other")}</option>
                                  ) : null}
                                </select>
                                {paisSeleccionado && city === CITY_OTHER_VALUE ? (
                                  <div className="market-registro-field--field-icon market-registro-field--icon-city-other mt-2">
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={cityOther}
                                      onChange={(e) => setCityOther(e.target.value)}
                                      placeholder={t("reg.ph_city_other")}
                                      autoComplete="address-level2"
                                      aria-label={t("reg.ph_city_other")}
                                      required
                                    />
                                  </div>
                                ) : null}
                              </div>
                              <div
                                className="market-registro-field market-registro-field--grid-spacer"
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {error ? (
                        <div
                          className={
                            errorKind === "duplicate"
                              ? "alert alert-warning hrs-reg-email-in-use py-3 small mb-3"
                              : "alert alert-danger py-2 small mb-3"
                          }
                          role="alert"
                          aria-live="polite"
                        >
                          {errorKind === "duplicate" ? (
                            <div className="d-flex gap-2 align-items-start">
                              <i className="bi bi-envelope-exclamation fs-5 flex-shrink-0 text-warning-emphasis" aria-hidden />
                              <div>
                                <strong className="d-block text-body">{duplicateHeading}</strong>
                                <p className="mt-1 mb-2 small text-body-secondary">{duplicateDetailMessage}</p>
                                <p className="mb-0 small">
                                  <Link
                                    to={MARKETPLACE.clientLogin}
                                    className="fw-semibold text-decoration-none"
                                    state={fromQuote ? { from: "quote" } : undefined}
                                  >
                                    {t("reg.dup_login")}
                                  </Link>
                                  <span className="text-muted"> · </span>
                                  <Link to={MARKETPLACE.clientLogin} className="fw-semibold text-decoration-none">
                                    {t("reg.dup_sgi")}
                                  </Link>
                                </p>
                                <p className="mb-0 mt-2 small text-muted border-top pt-2 hrs-reg-email-in-use__hint">
                                  {t("reg.dup_security_note")}
                                </p>
                              </div>
                            </div>
                          ) : (
                            error
                          )}
                        </div>
                      ) : null}

                      <div className="market-registro-submit-row market-registro-submit-row--auth">
                        <div className="market-registro-submit-row__cta">
                          <button
                            type="submit"
                            className="btn btn-success market-registro-submit"
                            disabled={submitting || !ready}
                          >
                            {!ready ? t("login.preparing") : submitting ? t("reg.submit_busy") : t("reg.submit")}
                          </button>
                        </div>
                        <div className="market-registro-auth-footer-links">
                          <Link
                            to="/equipment"
                            className="market-registro-auth-footer-links__back text-decoration-none"
                          >
                            <i className="bi bi-arrow-left-short me-1" aria-hidden />
                            {t("login.back_shop")}
                          </Link>
                          <span className="market-registro-auth-footer-links__login">
                            {t("reg.have_account")}{" "}
                            <Link to={MARKETPLACE.clientLogin} state={loginLinkState}>
                              {t("reg.login_link")}
                            </Link>
                          </span>
                        </div>
                      </div>
                    </form>
                  </div>
                  </RegistroAuthShell>
                    </>
                  )}
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
