import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext";
import { isDocumentAlreadyRegisteredError, isEmailAlreadyRegisteredError, registerMarketplaceCliente, wakeUpBackend } from "../lib/api";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import "../styles/marketplace-hashrate.css";
import {
  COUNTRIES_REGISTRO,
  CITY_OTHER_VALUE,
  DOCUMENTO_TIPO_OPTIONS,
  countryById,
  normalizeLocalPhoneInput,
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
  const { lang, t, tf } = useMarketplaceLang();
  const { user, loading, applyLoginResponse, logout } = useAuth();
  const location = useLocation();
  const fromQuote = (location.state as { from?: string } | null)?.from === "quote";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [documentoTipo, setDocumentoTipo] = useState<string>(DOCUMENTO_TIPO_OPTIONS[0].value);
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [countryId, setCountryId] = useState("");
  const [city, setCity] = useState("");
  const [cityOther, setCityOther] = useState("");
  const [direccion, setDireccion] = useState("");
  /** País asociado al prefijo E.164 (independiente del país de dirección; se sincroniza con él al cambiar). */
  const [celularDialId, setCelularDialId] = useState(DEFAULT_PHONE_DIAL_COUNTRY_ID);
  const [celularLocal, setCelularLocal] = useState("");
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<"client" | "duplicate" | "generic">("client");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [emailSuggestFocus, setEmailSuggestFocus] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 25000);
    wakeUpBackend().finally(() => {
      clearTimeout(t);
      setReady(true);
    });
    return () => clearTimeout(t);
  }, []);

  const paisSeleccionado = countryById(countryId);

  const countriesForPhoneSelect = useMemo(() => {
    const loc = marketplaceLocale(lang);
    return [...COUNTRIES_REGISTRO].sort((a, b) => {
      if (a.id === DEFAULT_PHONE_DIAL_COUNTRY_ID) return -1;
      if (b.id === DEFAULT_PHONE_DIAL_COUNTRY_ID) return 1;
      return a.name.localeCompare(b.name, loc);
    });
  }, [lang]);

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

  function applyEmailDomain(domain: string) {
    const base = emailLocal.trim();
    if (!base) return;
    setEmail(`${base}@${domain}`);
    setEmailSuggestFocus(false);
  }


  useEffect(() => {
    setCity("");
    setCityOther("");
    if (countryId) {
      setCelularDialId(countryId);
    }
  }, [countryId]);

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
    return (
      <div className="marketplace-asic-page marketplace-registro-page">
        <div className="bg-mesh" aria-hidden />
        <div className="bg-grid" aria-hidden />
        <div id="app" data-page="marketplace-registro-blocked">
          <MarketplaceSiteHeader />
          <main className="page-main page-main--market page-main--market--asic">
            <section className="market-registro-section">
              <div className="container py-5" style={{ maxWidth: 640 }}>
                <div className="market-registro-card">
                  <p className="small text-center mb-3">
                    <Link to="/marketplace" className="text-decoration-none fw-semibold" style={{ color: "#0d9488" }}>
                      ← {t("reg.blocked_back")}
                    </Link>
                  </p>
                  <h2 className="market-registro-card__title text-center">{t("reg.blocked_title_alt")}</h2>
                  <p className="text-muted small mb-3">
                    {tf("reg.blocked_detail", {
                      email: user.email ?? user.username ?? "—",
                      role: String(user.role),
                    })}
                  </p>
                  {fromQuote ? (
                    <p className="small mb-4" role="status">
                      {t("reg.blocked_from_quote")}
                    </p>
                  ) : (
                    <p className="small text-muted mb-4">{t("reg.blocked_else")}</p>
                  )}
                  <div className="d-flex flex-column gap-2">
                    <button type="button" className="btn btn-success market-registro-submit w-100" onClick={() => logout()}>
                      {t("reg.logout_continue")}
                    </button>
                    <Link to="/" className="btn btn-outline-secondary w-100">
                      {t("reg.hrs_home_short")}
                    </Link>
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorKind("client");
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
    if (documentoNumero.trim().length < 3) {
      setErrorKind("client");
      setError(t("reg.err.documento"));
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
    const cityFinal =
      city === CITY_OTHER_VALUE ? cityOther.trim() : city.trim();
    if (!city) {
      setErrorKind("client");
      setError(t("reg.err.city"));
      return;
    }
    if (city === CITY_OTHER_VALUE && cityFinal.length < 2) {
      setErrorKind("client");
      setError(t("reg.err.city_other"));
      return;
    }
    if (direccion.trim().length < 3) {
      setErrorKind("client");
      setError(t("reg.err.address"));
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
    const documentoIdentidad = `${documentoTipo} ${documentoNumero.trim()}`.trim();
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
        documentoIdentidad,
        country: pais.name,
        city: cityFinal,
        direccion: direccion.trim(),
        celular: celularFull,
      });
      applyLoginResponse(res);
    } catch (err) {
      if (isEmailAlreadyRegisteredError(err) || isDocumentAlreadyRegisteredError(err)) {
        setErrorKind("duplicate");
        setError(err instanceof Error ? err.message : t("reg.err.duplicate_fallback"));
      } else {
        setErrorKind("generic");
        setError(err instanceof Error ? err.message : t("reg.err.register_fail"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="marketplace-asic-page marketplace-registro-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-registro">
        <MarketplaceSiteHeader />
        <main className="page-main page-main--market page-main--market--asic">
          <section className="market-registro-section">
            <div className="container-fluid market-registro-shell px-3 px-sm-4 px-xl-5 py-4 py-lg-5">
              <div className="row g-4 g-xl-4 align-items-start">
                <aside className="col-lg-3 col-xl-3 d-none d-lg-block market-registro-aside" aria-label={t("reg.aside_aria")}>
                  <span className="market-registro-aside__badge">
                    <i className="bi bi-shop" aria-hidden />
                    {t("reg.badge")}
                  </span>
                  <h1 className="market-registro-aside__title">{t("reg.aside_title")}</h1>
                  <p className="market-registro-aside__lead">{t("reg.aside_lead")}</p>
                  <ul className="market-registro-aside__list">
                    <li>
                      <i className="bi bi-check-circle-fill" aria-hidden />
                      <span>{t("reg.aside_b1")}</span>
                    </li>
                    <li>
                      <i className="bi bi-check-circle-fill" aria-hidden />
                      <span>{t("reg.aside_b2")}</span>
                    </li>
                    <li>
                      <i className="bi bi-check-circle-fill" aria-hidden />
                      <span>{t("reg.aside_b3")}</span>
                    </li>
                  </ul>
                </aside>

                <div className="col-12 col-lg-9 col-xl-9">
                  <div className="market-registro-hero-compact">
                    <span className="market-registro-aside__badge">
                      <i className="bi bi-shop" aria-hidden />
                      {t("reg.badge")}
                    </span>
                    <h1 className="market-registro-aside__title">{t("reg.hero_title")}</h1>
                    <p className="market-registro-aside__lead mb-0">{t("reg.hero_lead")}</p>
                  </div>

                  <div className="market-registro-card">
                    <header className="market-registro-card__head">
                      <p className="market-registro-card__kicker">{t("reg.card_kicker_lower")}</p>
                      <h2 className="market-registro-card__title">{t("reg.title")}</h2>
                      <p className="market-registro-card__desc">{t("reg.card_desc_long")}</p>
                    </header>

                    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
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
                        <div className="row g-3 mb-0">
                          <div className="col-md-6">
                            <MarketplacePasswordField
                              label={t("reg.pw_min")}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="new-password"
                              labelClassName="form-label market-registro-label"
                              required
                            />
                          </div>
                          <div className="col-md-6">
                            <MarketplacePasswordField
                              label={t("reg.pw_confirm")}
                              value={password2}
                              onChange={(e) => setPassword2(e.target.value)}
                              autoComplete="new-password"
                              labelClassName="form-label market-registro-label"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div className="row g-4 market-registro-split-xl mb-2">
                        <div className="col-xl-6">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 h-100"
                            role="group"
                            aria-labelledby="reg-legend-personal"
                          >
                            <div id="reg-legend-personal" className="market-registro-fieldset__legend">
                              <i className="bi bi-person-vcard" aria-hidden />
                              {t("reg.legend_personal")}
                            </div>
                            <div className="row g-3 mb-1">
                              <div className="col-md-6">
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
                              <div className="col-md-6">
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
                            </div>
                          </div>
                        </div>
                        <div className="col-xl-6">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 h-100"
                            role="group"
                            aria-labelledby="reg-legend-ubicacion"
                          >
                            <div id="reg-legend-ubicacion" className="market-registro-fieldset__legend">
                              <i className="bi bi-geo-alt" aria-hidden />
                              {t("reg.legend_ship")}
                            </div>
                            <div className="row g-3 mb-1">
                              <div className="col-md-6">
                                <label className="form-label market-registro-label" htmlFor="reg-pais">
                                  {t("reg.label_country")}
                                </label>
                                <select
                                  id="reg-pais"
                                  className="form-select"
                                  value={countryId}
                                  onChange={(e) => setCountryId(e.target.value)}
                                  autoComplete="country"
                                  aria-label={t("reg.label_country")}
                                  required
                                >
                                  <option value="">{t("reg.country_placeholder")}</option>
                                  {COUNTRIES_REGISTRO.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.dial})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="col-md-6">
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
                                  {paisSeleccionado ? <option value={CITY_OTHER_VALUE}>{t("reg.city_other")}</option> : null}
                                </select>
                                {paisSeleccionado && city === CITY_OTHER_VALUE ? (
                                  <input
                                    type="text"
                                    className="form-control mt-2"
                                    value={cityOther}
                                    onChange={(e) => setCityOther(e.target.value)}
                                    placeholder={t("reg.ph_city_other")}
                                    autoComplete="address-level2"
                                    aria-label={t("reg.ph_city_other")}
                                  />
                                ) : null}
                              </div>
                            </div>
                            <div className="mb-0">
                              <label className="form-label market-registro-label" htmlFor="reg-direccion">
                                {t("reg.label_address")}
                              </label>
                              <input
                                id="reg-direccion"
                                type="text"
                                className="form-control"
                                value={direccion}
                                onChange={(e) => setDireccion(e.target.value)}
                                autoComplete="street-address"
                                placeholder={t("reg.ph_address")}
                                required
                                minLength={3}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="row g-4 market-registro-doc-contact-row align-items-stretch mb-2">
                        <div className="col-md-6">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 h-100"
                            role="group"
                            aria-labelledby="reg-legend-doc"
                          >
                            <div id="reg-legend-doc" className="market-registro-fieldset__legend">
                              <i className="bi bi-card-text" aria-hidden />
                              {t("reg.legend_id")}
                            </div>
                            <div className="market-registro-doc-grid">
                              <select
                                id="reg-doc-tipo"
                                className="form-select market-registro-doc-select"
                                value={documentoTipo}
                                onChange={(e) => setDocumentoTipo(e.target.value)}
                                aria-label={t("reg.id_doc_type")}
                                required
                              >
                                {DOCUMENTO_TIPO_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                id="reg-doc-numero"
                                type="text"
                                className="form-control"
                                value={documentoNumero}
                                onChange={(e) => setDocumentoNumero(e.target.value)}
                                autoComplete="off"
                                placeholder={t("reg.id_doc_num_ph")}
                                aria-label={t("reg.id_doc_num_ph")}
                                required
                                minLength={3}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div
                            className="market-registro-fieldset market-registro-fieldset--panel market-registro-fieldset--panel--wide mb-0 h-100"
                            role="group"
                            aria-labelledby="reg-legend-celular"
                          >
                            <div id="reg-legend-celular" className="market-registro-fieldset__legend">
                              <i className="bi bi-phone" aria-hidden />
                              {t("reg.legend_contact_block")}
                            </div>
                            <div className="mb-0 market-registro-phone-block">
                              <label className="form-label market-registro-label" htmlFor="reg-cel-num">
                                {t("reg.label_mobile")}
                              </label>
                              <div className="input-group flex-nowrap hrs-reg-phone-input-group">
                                <select
                                  className="form-select flex-shrink-0 hrs-reg-phone-dial market-registro-phone-dial"
                                  value={celularDialId}
                                  onChange={(e) => setCelularDialId(e.target.value)}
                                  aria-label={t("reg.dial_aria")}
                                  required
                                >
                                  {countriesForPhoneSelect.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.dial} · {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  id="reg-cel-num"
                                  type="tel"
                                  className="form-control flex-grow-1 min-w-0"
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
                                <strong className="d-block text-body">{t("reg.dup_heading")}</strong>
                                <p className="mt-1 mb-2 small text-body-secondary">{error}</p>
                                <p className="mb-0 small">
                                  <Link
                                    to="/marketplace/login"
                                    className="fw-semibold text-decoration-none"
                                    state={fromQuote ? { from: "quote" } : undefined}
                                  >
                                    {t("reg.dup_login")}
                                  </Link>
                                  <span className="text-muted"> · </span>
                                  <Link to="/login" className="fw-semibold text-decoration-none">
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

                      <div className="row align-items-center market-registro-submit-row g-2 g-md-3">
                        <div className="col-12 col-md-6">
                          <div className="market-registro-foot market-registro-foot--beside-submit small text-muted">
                            <Link to="/marketplace" className="text-decoration-none">
                              <i className="bi bi-arrow-left-short me-1" aria-hidden />
                              {t("login.back_shop")}
                            </Link>
                            <span className="mx-2">·</span>
                            <Link
                              to="/marketplace/login"
                              className="text-decoration-none"
                              state={fromQuote ? { from: "quote" } : undefined}
                            >
                              {t("reg.footer_have_login")}
                            </Link>
                          </div>
                        </div>
                        <div className="col-12 col-md-6">
                          <button
                            type="submit"
                            className="btn btn-success w-100 market-registro-submit"
                            disabled={submitting || !ready}
                          >
                            {!ready ? t("login.preparing") : submitting ? t("reg.submit_busy") : t("reg.submit")}
                          </button>
                        </div>
                      </div>
                    </form>
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
