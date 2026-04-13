import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { canUseMarketplaceQuoteCart } from "../../lib/auth.js";
import { useAuth } from "../../contexts/AuthContext";
import { useOptionalMarketplaceQuoteCart } from "../../contexts/MarketplaceQuoteCartContext.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import type { MarketplaceLang } from "../../lib/i18n.js";

export function MarketplaceSiteHeader() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const onCatalog = pathname === "/marketplace" || pathname === "/marketplace/";
  const onCorporateHome = pathname === "/marketplace/home" || pathname === "/marketplace/home/";
  const onCompanyPage = pathname === "/marketplace/company" || pathname === "/marketplace/company/";
  const onFaqPage = pathname === "/marketplace/faq" || pathname === "/marketplace/faq/";
  const onContactPage = pathname === "/marketplace/contact" || pathname === "/marketplace/contact/";
  const corpHashCurrent = (id: string) =>
    onCorporateHome && hash === `#${id}` ? ("is-current" as const) : undefined;
  const { user, logout } = useAuth();
  const { lang, setLang, t, tf } = useMarketplaceLang();
  const showLoggedAccount = Boolean(user && canUseMarketplaceQuoteCart(user.role));
  const quoteCart = useOptionalMarketplaceQuoteCart();

  const cartAria =
    quoteCart?.totalUnits === 0
      ? t("header.cart_empty")
      : quoteCart && quoteCart.totalUnits > 99
        ? t("header.cart_units_many")
        : quoteCart
          ? tf("header.cart_units", { n: String(quoteCart.totalUnits) })
          : t("header.cart_empty");

  function renderAccountBlock() {
    return (
      <div
        className={
          "site-header__account" +
          (!showLoggedAccount ? " site-header__account--guest" : "")
        }
      >
        {showLoggedAccount ? (
          <>
            <span className="site-header__account-email" title={user?.email ?? user?.username}>
              {user?.email ?? user?.username}
            </span>
            <button
              type="button"
              className="site-header__account-logout"
              onClick={() => {
                logout();
                window.location.href = "/marketplace";
              }}
            >
              {t("header.logout")}
            </button>
          </>
        ) : (
          <div className="site-header__auth-actions">
            <Link to="/marketplace/registro" className="site-header__auth-link site-header__auth-link--primary">
              {t("header.register")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <header className="site-header site-header--marketplace">
      <div className="container site-header__inner">
        <Link className="logo-link logo-link--main" to="/marketplace/home" aria-label={t("header.logo_aria")}>
          <img
            className="site-logo-img"
            src="https://hashrate.space/wp-content/uploads/hashrate-LOGO.png"
            alt="Hashrate Space"
            width={248}
            height={60}
            loading="eager"
            decoding="async"
          />
        </Link>
        <div className="site-header__trailing">
          <div className="site-header__account-wrap site-header__account-wrap--desktop">{renderAccountBlock()}</div>
          {quoteCart ? (
            <button
              type="button"
              className="market-quote-cart-trigger"
              onClick={quoteCart.toggleDrawer}
              aria-expanded={quoteCart.drawerOpen}
              aria-controls="market-quote-drawer-panel"
              title={t("header.cart_open")}
              aria-label={cartAria}
            >
              <span className="market-quote-cart-trigger__icon-wrap" aria-hidden>
                <svg className="market-quote-cart-trigger__svg" viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M6 6h15l-1.5 9h-12z"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <path d="M6 6 5 3H2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="20" r="1.1" fill="currentColor" stroke="none" />
                  <circle cx="18" cy="20" r="1.1" fill="currentColor" stroke="none" />
                </svg>
                {quoteCart.totalUnits > 0 ? (
                  <span
                    className={
                      "market-quote-cart-trigger__badge" +
                      (quoteCart.totalUnits > 9 ? " market-quote-cart-trigger__badge--wide" : "")
                    }
                  >
                    {quoteCart.totalUnits > 99 ? "99+" : quoteCart.totalUnits}
                  </span>
                ) : null}
              </span>
              <span className="market-quote-cart-trigger__label">{t("header.cart")}</span>
            </button>
          ) : (
            <span className="site-header__cart-slot" aria-hidden />
          )}
          <div
            className="market-lang-switch site-header__lang-switch"
            role="group"
            aria-label={t("header.lang_hint")}
          >
            {(["es", "en", "pt"] as const satisfies readonly MarketplaceLang[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`market-lang-switch__btn${lang === code ? " active" : ""}`}
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
              >
                {code === "es" ? t("header.lang_es") : code === "en" ? t("header.lang_en") : t("header.lang_pt")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            onClick={() => setNavOpen((o) => !o)}
          >
            {t("header.menu")}
          </button>
        </div>
        <nav id="primary-nav" className={"nav-main" + (navOpen ? " is-open" : "")} aria-label="Principal">
          <ul>
            <li>
              <Link
                to="/marketplace/home"
                className={onCorporateHome ? "is-current" : undefined}
                {...(onCorporateHome ? { "aria-current": "page" as const } : {})}
              >
                {t("nav.home")}
              </Link>
            </li>
            <li>
              <Link to="/marketplace/home#servicios" className={corpHashCurrent("servicios")}>
                {t("nav.services")}
              </Link>
            </li>
            <li>
              <Link
                to="/marketplace"
                className={onCatalog ? "is-current" : undefined}
                {...(onCatalog ? { "aria-current": "page" as const } : {})}
              >
                {t("nav.equipment")}
              </Link>
            </li>
            <li>
              <Link
                to="/marketplace/faq"
                className={onFaqPage ? "is-current" : undefined}
                {...(onFaqPage ? { "aria-current": "page" as const } : {})}
              >
                {t("nav.faq")}
              </Link>
            </li>
            <li>
              <Link
                to="/marketplace/company"
                className={onCompanyPage ? "is-current" : undefined}
                {...(onCompanyPage ? { "aria-current": "page" as const } : {})}
              >
                {t("nav.company")}
              </Link>
            </li>
            <li>
              <Link
                to="/marketplace/contact"
                className={onContactPage ? "is-current" : undefined}
                {...(onContactPage ? { "aria-current": "page" as const } : {})}
              >
                {t("nav.contact")}
              </Link>
            </li>
            <li className="site-header__account-wrap site-header__account-wrap--mobile">
              {renderAccountBlock()}
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
