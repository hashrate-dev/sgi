import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { postMarketplaceAsicInquiryPublic } from "../../lib/api.js";
import { MailCtaIcon } from "./MarketplaceCtaIcons.js";

type Props = {
  open: boolean;
  onClose: () => void;
  subject: string;
  defaultBody: string;
};

export function MarketplaceProductEmailInquiryModal({ open, onClose, subject, defaultBody }: Props) {
  const { t } = useMarketplaceLang();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [simulated, setSimulated] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(false);
    setSimulated(false);
    setMessage(defaultBody);
  }, [open, defaultBody]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSending(true);
      try {
        const r = await postMarketplaceAsicInquiryPublic({
          email: email.trim(),
          name: name.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
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
    [email, message, name, subject]
  );

  if (!open) return null;

  return (
    <div className="asic-email-window asic-email-window--solo asic-email-window--in-app" role="dialog" aria-modal="true">
      <button type="button" className="asic-email-window__backdrop-btn" aria-label={t("modal.close_win")} onClick={onClose} />
      <div className="asic-email-window__solo-card">
        <button type="button" className="asic-email-window__solo-x" onClick={onClose} aria-label={t("modal.close_win")}>
          <span aria-hidden="true">×</span>
        </button>

        <h2 className="asic-email-window__form-heading">
          <MailCtaIcon className="asic-email-window__form-heading-icon" />
          {t("modal.email_btn")}
        </h2>
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
