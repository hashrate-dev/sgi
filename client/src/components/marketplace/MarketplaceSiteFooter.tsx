import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { canManageUsers } from "../../lib/auth.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

const UP = "https://hashrate.space/wp-content/uploads";
const CORP_VIDEO_URL = "https://hashrate.space/video/Hashrate-Farm-Py.mp4";

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
      aria-label={t("footer.strip_region")}
    >
      <div className="market-corp-strip__inner market-corp-strip__inner--footer">
        <div className="market-corp-strip__brand market-corp-strip__brand--footer">
          <img
            src={`${UP}/hashrate-white-300x46.png`}
            alt="Hashrate Space"
            width={300}
            height={46}
            loading="lazy"
            decoding="async"
          />
          <p className="market-corp-strip__tagline market-corp-strip__tagline--footer">{t("footer.brand_slogan")}</p>
        </div>
        <div className="market-corp-strip__col market-corp-strip__col--company">
          <h3 className="market-corp-strip__h3 market-corp-strip__h3--footer">{t("footer.col_company")}</h3>
          <ul className="market-corp-strip__links market-corp-strip__links--footer">
            <li>
              <Link to="/marketplace/home">{t("nav.home")}</Link>
            </li>
            <li>
              <Link to="/marketplace/services">{t("nav.services")}</Link>
            </li>
            <li>
              <Link to="/marketplace">{t("nav.equipment")}</Link>
            </li>
            <li>
              <Link to="/marketplace/faq">{t("nav.faq")}</Link>
            </li>
            <li>
              <Link to="/marketplace/company">{t("nav.company")}</Link>
            </li>
            <li>
              <Link to="/marketplace/contact">{t("nav.contact")}</Link>
            </li>
            {showSgiLink ? (
              <li>
                <Link to="/">{t("footer.sgi")}</Link>
              </li>
            ) : null}
          </ul>
        </div>
        <div className="market-corp-strip__col market-corp-strip__col--media">
          <h3 className="market-corp-strip__h3 market-corp-strip__h3--footer">{t("footer.col_media")}</h3>
          <ul className="market-corp-strip__links market-corp-strip__links--footer">
            <li>
              <a href="https://hashrate.space/" target="_blank" rel="noopener noreferrer">
                {t("footer.media.site")}
              </a>
            </li>
            <li>
              <a href={CORP_VIDEO_URL} target="_blank" rel="noopener noreferrer">
                {t("footer.media.video")}
              </a>
            </li>
          </ul>
        </div>
        <div className="market-corp-strip__col market-corp-strip__col--social">
          <h3 className="market-corp-strip__h3 market-corp-strip__h3--footer">{t("footer.col_social")}</h3>
          <div className="market-corp-strip__social market-corp-strip__social--footer" role="list">
            <a
              className="market-corp-strip__social-btn"
              href="https://www.instagram.com/hashrate.space/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footer.social.instagram")}
              role="listitem"
            >
              <FooterSocialInstagram />
            </a>
            <a
              className="market-corp-strip__social-btn"
              href="https://www.linkedin.com/company/hashrate-space"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footer.social.linkedin")}
              role="listitem"
            >
              <FooterSocialLinkedIn />
            </a>
            <a
              className="market-corp-strip__social-btn"
              href="https://x.com/Hashrate_Space"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footer.social.x")}
              role="listitem"
            >
              <FooterSocialX />
            </a>
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

function FooterSocialInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A3.5 3.5 0 1 1 8.5 11 3.5 3.5 0 0 1 12 7.5zm0 2A1.5 1.5 0 1 0 13.5 11 1.5 1.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"
      />
    </svg>
  );
}

function FooterSocialLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7.5 0h3.8v2h.05c.53-1 1.84-2.31 3.8-2.31 4.06 0 4.8 2.67 4.8 6.14V23h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.1V23h-4V8z"
      />
    </svg>
  );
}

function FooterSocialX() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}
