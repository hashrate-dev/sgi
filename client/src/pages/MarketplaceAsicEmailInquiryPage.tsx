import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useMarketplaceLang } from "../contexts/MarketplaceLanguageContext.js";
import { postMarketplaceAsicInquiryPublic } from "../lib/api.js";
import { MailCtaIcon } from "../components/marketplace/MarketplaceCtaIcons.js";
import "../styles/marketplace-hashrate.css";

/**
 * Solo el formulario «Consultar por correo» (ventana pequeña).
 * Ficha ASIC: query b,m,h,p para asunto y cuerpo por defecto.
 * Carrito: ruta `/marketplace/consultar-correo-carrito` — texto genérico (sin equipo concreto).
 */
export function MarketplaceAsicEmailInquiryPage() {
  const location = useLocation();
  const [search] = useSearchParams();
  const brand = (search.get("b") ?? "").trim();
  const model = (search.get("m") ?? "").trim();
  const hash = (search.get("h") ?? "").trim();
  const price = (search.get("p") ?? "").trim();

  const { t, tf } = useMarketplaceLang();
  const isCartInquiry = location.pathname.endsWith("/consultar-correo-carrito");

  const mailText = useMemo(() => {
    if (isCartInquiry) {
      return { subject: t("drawer.email_inquiry_subject"), body: t("drawer.email_inquiry_default_body") };
    }
    if (!brand.length || !model.length) return { subject: "", body: "" };
    return {
      subject: tf("modal.mail.subject", { brand, model, hash, price }),
      body: tf("modal.email_inquiry_default_body", { brand, model, hash, price }),
    };
  }, [isCartInquiry, brand, model, hash, price, tf, t]);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const messageSeeded = useRef(false);

  useEffect(() => {
    if (messageSeeded.current || !mailText.body) return;
    setMessage(mailText.body);
    messageSeeded.current = true;
  }, [mailText.body]);

  useEffect(() => {
    const prev = document.title;
    document.title = t("modal.email_inquiry_page_title_short");
    return () => {
      document.title = prev;
    };
  }, [t]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSending(true);
      try {
        const r = await postMarketplaceAsicInquiryPublic({
          email: email.trim(),
          name: name.trim() || undefined,
          subject: mailText.subject.trim(),
          message: message.trim(),
          ...(isCartInquiry ? { source: "cart" as const } : {}),
        });
        if (r.ok) {
          setSuccess(true);
          setSimulated(Boolean(r.simulated));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [email, message, name, mailText.subject, isCartInquiry]
  );

  if (!isCartInquiry && (!brand.length || !model.length)) {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <div className="asic-email-window asic-email-window--solo">
      <div className="asic-email-window__solo-card">
        <button type="button" className="asic-email-window__solo-x" onClick={handleClose} aria-label={t("modal.close_win")}>
          <span aria-hidden="true">×</span>
        </button>

        <h1 className="asic-email-window__form-heading">
          <MailCtaIcon className="asic-email-window__form-heading-icon" />
          {t("modal.email_btn")}
        </h1>
        <p className="asic-email-window__form-lede">{t("modal.email_inquiry_lede")}</p>

        <form className="asic-email-window__form" onSubmit={onSubmit}>
          <label className="asic-email-window__label">
            <span className="asic-email-window__label-txt">{t("modal.email_inquiry_email")}</span>
            <input
              type="email"
              name="inquiry-email"
              required
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={sending || success}
            />
          </label>
          <label className="asic-email-window__label">
            <span className="asic-email-window__label-txt">{t("modal.email_inquiry_name")}</span>
            <input
              type="text"
              name="inquiry-name"
              autoComplete="name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              disabled={sending || success}
            />
          </label>
          <label className="asic-email-window__label">
            <span className="asic-email-window__label-txt">{t("modal.email_inquiry_message")}</span>
            <textarea
              name="inquiry-message"
              required
              value={message}
              onChange={(ev) => setMessage(ev.target.value)}
              disabled={sending || success}
              rows={6}
            />
          </label>
          {error ? (
            <p className="asic-email-window__msg asic-email-window__msg--err" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="asic-email-window__msg asic-email-window__msg--ok" role="status">
              {simulated ? t("modal.email_inquiry_success_sim") : t("modal.email_inquiry_success")}
              <span className="asic-email-window__msg-hint">{t("modal.email_inquiry_close_window")}</span>
            </p>
          ) : null}
          <div className="asic-email-window__actions">
            {!success ? (
              <button type="submit" className="asic-email-window__submit" disabled={sending}>
                {sending ? t("modal.email_inquiry_sending") : t("modal.email_inquiry_send")}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
