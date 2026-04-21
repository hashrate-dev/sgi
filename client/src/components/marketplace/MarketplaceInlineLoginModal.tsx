import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { canUseMarketplaceQuoteCart } from "../../lib/auth.js";
import { wakeUpBackend } from "../../lib/api";
import { MarketplacePasswordField } from "./MarketplacePasswordField";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MarketplaceInlineLoginModal({ open, onClose }: Props) {
  const { t } = useMarketplaceLang();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => setReady(true), 25000);
    void wakeUpBackend().finally(() => {
      window.clearTimeout(timeoutId);
      setReady(true);
    });
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || loading) return;
    if (user && canUseMarketplaceQuoteCart(user.role)) onClose();
  }, [open, loading, user, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.err_generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="market-login-inline" role="presentation">
      <button
        type="button"
        className="market-login-inline__backdrop"
        aria-label={t("drawer.close")}
        onClick={onClose}
      />
      <div className="market-login-inline__dialog" role="dialog" aria-modal="true" aria-label={t("login.form_title")}>
        <button type="button" className="market-login-inline__close" aria-label={t("drawer.close")} onClick={onClose}>
          ×
        </button>
        <div className="market-login-inline__head">
          <p className="market-login-inline__kicker">{t("login.kicker")}</p>
          <h2 className="market-login-inline__title">{t("login.form_title")}</h2>
          <p className="market-login-inline__desc">{t("login.intro")}</p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="market-login-inline__form">
          <div className="mb-3">
            <input
              id="market-inline-login-user"
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
          {error ? (
            <div className="alert alert-danger py-2 small mt-2 mb-0" role="alert">
              {error}
            </div>
          ) : null}
          <button type="submit" className="btn hrs-auth-continue-btn w-100 mt-3" disabled={submitting || !ready}>
            {!ready ? t("login.preparing") : submitting ? t("login.entering") : t("login.submit")}
          </button>
        </form>
        <p className="market-login-inline__links">
          <Link to="/marketplace/signup" onClick={onClose}>
            {t("login.register")}
          </Link>
          <span aria-hidden>·</span>
          <Link to="/marketplace/login" onClick={onClose}>
            Login completo
          </Link>
        </p>
      </div>
    </div>
  );
}
