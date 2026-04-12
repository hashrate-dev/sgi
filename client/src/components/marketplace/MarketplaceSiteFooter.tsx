import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { canManageUsers } from "../../lib/auth.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

const UP = "https://hashrate.space/wp-content/uploads";

export type MarketplaceSiteFooterVariant = "default" | "corp-end-band";

type Props = {
  /** Dentro de `market-corp-end-band`: ya hay degradado global; no duplicar. */
  variant?: MarketplaceSiteFooterVariant;
};

export function MarketplaceSiteFooter({ variant = "default" }: Props) {
  const year = new Date().getFullYear();
  const { user, loading } = useAuth();
  const { t, tf } = useMarketplaceLang();
  const showSgiLink = Boolean(!loading && user && canManageUsers(user.role));
  const inCorpBand = variant === "corp-end-band";

  const strip = (
    <section
      id="empresa"
      className="market-corp-strip market-corp-anchor site-footer--marketplace__strip"
      aria-label={t("header.menu")}
    >
      <div className="market-corp-strip__inner">
        <div className="market-corp-strip__brand">
          <img
            src={`${UP}/hashrate-white-300x46.png`}
            alt="Hashrate Space"
            width={300}
            height={46}
            loading="lazy"
            decoding="async"
          />
          <p className="market-corp-strip__tagline">{t("corp.strip.tagline")}</p>
        </div>
        <div className="market-corp-strip__cols">
          <div>
            <h3 className="market-corp-strip__h3">{t("header.menu")}</h3>
            <ul className="market-corp-strip__links">
              <li>
                <Link to="/marketplace/home">{t("nav.home")}</Link>
              </li>
              <li>
                <Link to="/marketplace/home#servicios">{t("nav.services")}</Link>
              </li>
              <li>
                <Link to="/marketplace">{t("nav.equipment")}</Link>
              </li>
              <li>
                <Link to="/marketplace/home#faq">{t("nav.faq")}</Link>
              </li>
              <li>
                <Link to="/marketplace/home#empresa">{t("nav.company")}</Link>
              </li>
              <li>
                <Link to="/marketplace/home#contacto">{t("nav.contact")}</Link>
              </li>
              {showSgiLink ? (
                <li>
                  <Link to="/">{t("footer.sgi")}</Link>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );

  const legal = (
    <div className="site-footer--marketplace__legal">
      <p className="site-footer--marketplace__copy mb-0" id="footer-copy">
        {tf("footer.copyright", { year: String(year) })}
      </p>
    </div>
  );

  if (inCorpBand) {
    return (
      <footer className="site-footer site-footer--marketplace site-footer--marketplace--corp-end">
        {strip}
        {legal}
      </footer>
    );
  }

  return (
    <footer className="site-footer site-footer--marketplace site-footer--marketplace--standalone">
      <div className="site-footer--marketplace__band">
        <div className="site-footer--marketplace__band-grad" aria-hidden />
        {strip}
        {legal}
      </div>
    </footer>
  );
}
