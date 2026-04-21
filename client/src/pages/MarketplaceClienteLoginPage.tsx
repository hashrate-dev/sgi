import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { canUseMarketplaceQuoteCart } from "../lib/auth.js";
import { useAuth } from "../contexts/AuthContext";
import { getMarketplaceAsicVitrina, requestPasswordReset, wakeUpBackend } from "../lib/api";
import {
  getMarketplaceAuthShelfFallbackProducts,
  mergeAsicCatalogWithCorpGridExtras,
} from "../lib/marketplaceAsicCatalog.js";
import type { AsicProduct } from "../lib/marketplaceAsicCatalog.js";
import { AsicShelfProduct } from "../components/marketplace/AsicShelfProduct.js";
import { MarketplaceSiteHeader } from "../components/marketplace/MarketplaceSiteHeader";
import { MarketplaceSiteFooter } from "../components/marketplace/MarketplaceSiteFooter";
import { MarketplacePasswordField } from "../components/marketplace/MarketplacePasswordField";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../lib/i18n.js";
import "../styles/marketplace-hashrate.css";
import "../styles/facturacion.css";

export function MarketplaceClienteLoginPage() {
  const { lang, t, tf } = useMarketplaceLang();
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
  const [bgProducts, setBgProducts] = useState<AsicProduct[]>(() => getMarketplaceAuthShelfFallbackProducts());

  useEffect(() => {
    const timeoutId = setTimeout(() => setReady(true), 25000);
    wakeUpBackend().finally(() => {
      clearTimeout(timeoutId);
      setReady(true);
    });
    return () => clearTimeout(timeoutId);
  }, []);

  /** Misma vitrina que el catálogo: equipos reales de fondo en /marketplace/login */
  useEffect(() => {
    let cancelled = false;
    void getMarketplaceAsicVitrina()
      .then((res) => {
        if (cancelled) return;
        const list = res.products ?? [];
        setBgProducts(
          list.length > 0 ? mergeAsicCatalogWithCorpGridExtras(list) : getMarketplaceAuthShelfFallbackProducts()
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const shelfProducts = useMemo(() => {
    const list = [...bgProducts];
    const label = (p: AsicProduct) => `${p.brand} ${p.model}`.toLowerCase();
    list.sort((a, b) => {
      const ma = a.algo === "sha256" ? 0 : 1;
      const mb = b.algo === "sha256" ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return label(a).localeCompare(label(b), marketplaceLocale(lang));
    });
    return list;
  }, [bgProducts, lang]);

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
      setError("Ingresá tu correo para enviarte el enlace de recuperación.");
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordReset(email.trim(), "marketplace");
      // En el login no mostramos detalles sensibles (token/URL de desarrollo).
      setResetMsg("Te enviamos un enlace para restablecer la contraseña. Revisá tu correo (incluido spam).");
    } catch (err) {
      setResetMsg("");
      setError(err instanceof Error ? err.message : "No se pudo iniciar el restablecimiento.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="marketplace-asic-page marketplace-login-page">
      <div className="bg-mesh" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div id="app" data-page="marketplace-login">
        <MarketplaceSiteHeader />
        <main id="page-main" className="page-main page-main--market page-main--market--asic">
          <section className="section section--market-shelf market-login-page__section">
            <div className="market-intro-wrap">
              <header className="market-intro">
                <p className="market-intro__kicker">{t("login.kicker")}</p>
                <p className="market-intro__desc mb-0">
                  <strong>{t("login.intro_strong")}</strong> {t("login.intro_after")}
                </p>
              </header>
            </div>
            <div className="market-login-page__backdrop">
              <div className="market-login-page__stack">
                <div className="market-shelf-wrap market-login-page__shelf-real">
                  <div className="shelf-grid market-shelf-grid--catalog-v2 market-login-page__shelf-grid" aria-hidden>
                    {shelfProducts.map((p, i) => (
                      <AsicShelfProduct
                        key={p.id}
                        product={p}
                        productIndex={i}
                        filteredHidden={false}
                        onOpenModal={() => {}}
                      />
                    ))}
                  </div>
                </div>
                <div className="market-login-page__card-float">
                  <div className="hrs-card p-4 market-login-page__form-card">
                    <h2 className="hrs-title mb-4 text-center">{t("login.form_title")}</h2>

                    <form onSubmit={(e) => void handleSubmit(e)}>
                      <div className="mb-3">
                        <label className="form-label" htmlFor="marketplace-login-user">
                          {t("login.user_label")}
                        </label>
                        <input
                          id="marketplace-login-user"
                          type="text"
                          className="form-control"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="username"
                          required
                        />
                      </div>
                      <MarketplacePasswordField
                        label={t("login.password")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <div className="d-flex justify-content-end mb-3">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          onClick={() => void handleForgotPassword()}
                          disabled={resetBusy}
                        >
                          {resetBusy ? "Enviando..." : "Olvidé mi contraseña"}
                        </button>
                      </div>
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
                      <button type="submit" className="btn btn-primary w-100" disabled={submitting || !ready}>
                        {!ready ? t("login.preparing") : submitting ? t("login.entering") : t("login.submit")}
                      </button>
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
