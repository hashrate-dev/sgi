import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { canManageUsers } from "../../lib/auth.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

export function MarketplaceSiteFooter() {
  const year = new Date().getFullYear();
  const { user, loading } = useAuth();
  const { t } = useMarketplaceLang();
  const showSgiLink = Boolean(!loading && user && canManageUsers(user.role));

  return (
    <footer
      className={`site-footer site-footer--marketplace${showSgiLink ? " site-footer--marketplace--fixed" : ""}`}
    >
      <div
        className={`site-footer--marketplace__row${showSgiLink ? " site-footer--marketplace__row--with-sgi" : ""}`}
      >
        <p className="site-footer--marketplace__copy mb-0">
          © <span id="footer-year">{year}</span> Hashrate Space ·{" "}
          <a href="https://hashrate.space" target="_blank" rel="noopener noreferrer">
            hashrate.space
          </a>
        </p>
        {showSgiLink ? (
          <Link to="/" className="site-footer--marketplace__sgi-link">
            {t("footer.sgi")}
          </Link>
        ) : null}
      </div>
    </footer>
  );
}
