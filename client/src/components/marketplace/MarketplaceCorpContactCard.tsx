import { useCallback, useState, type FormEvent } from "react";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { postMarketplaceContactPublic } from "../../lib/api.js";

export type MarketplaceCorpContactCardProps = {
  /** id del <h2> para aria-labelledby en la section */
  titleId: string;
  /** Si se define, la section lleva id (p. ej. "contacto" en home) y clase ancla */
  anchorId?: string;
};

export function MarketplaceCorpContactCard({ titleId, anchorId }: MarketplaceCorpContactCardProps) {
  const { t } = useMarketplaceLang();
  const [form, setForm] = useState({
    name: "",
    last: "",
    email: "",
    subject: "",
    phone: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);
  const [successWasSimulated, setSuccessWasSimulated] = useState(false);

  const submitForm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setFormSuccess(false);
      setSuccessWasSimulated(false);
      setSubmitting(true);
      try {
        const r = await postMarketplaceContactPublic({
          name: form.name.trim(),
          lastName: form.last.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
        });
        if (r.ok) {
          setFormSuccess(true);
          setSuccessWasSimulated(Boolean(r.simulated));
          setForm({ name: "", last: "", email: "", subject: "", phone: "", message: "" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setFormError(msg || t("corp.form.error_generic"));
      } finally {
        setSubmitting(false);
      }
    },
    [form, t]
  );

  return (
    <section
      {...(anchorId ? { id: anchorId } : {})}
      className={`market-corp-contact-wp${anchorId ? " market-corp-anchor" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="market-corp-contact-wp__panel">
        <div className="market-corp-contact-wp__gradient" aria-hidden />
        <div className="market-corp-contact-wp__noise noise-overlay" aria-hidden />
        <div className="market-corp-contact-wp__inner">
          <div className="market-corp-contact-wp__col">
            <h2 id={titleId} className="market-corp-contact-wp__h2">
              {t("corp.contact.title")}
            </h2>
            <div className="market-corp-contact-wp__blocks">
              <p>
                <strong>{t("corp.contact.support")}</strong>
                <br />
                <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.support_email")}`}>
                  {t("corp.contact.support_email")}
                </a>
              </p>
              <p>
                <strong>{t("corp.contact.investors")}</strong>
                <br />
                <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.investors_email")}`}>
                  {t("corp.contact.investors_email")}
                </a>
              </p>
              <p>
                <strong>{t("corp.contact.sales")}</strong>
                <br />
                <a className="market-corp-contact-wp__link" href={`mailto:${t("corp.contact.sales_email")}`}>
                  {t("corp.contact.sales_email")}
                </a>
              </p>
              <p>
                <strong>{t("corp.contact.headquarter")}</strong>
                <br />
                {t("corp.contact.addr1")}
                <br />
                <span className="market-corp-contact-wp__muted">{t("corp.contact.phones")}</span>
                <br />
                {t("corp.contact.addr2")}
              </p>
            </div>
            <h3 className="market-corp-contact-wp__h3">{t("corp.contact.social")}</h3>
            <div className="market-corp-social">
              <a
                className="market-corp-social__btn"
                href="https://www.instagram.com/hashrate.space/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.social.instagram")}
              >
                <SocialInstagram />
              </a>
              <a
                className="market-corp-social__btn"
                href="https://www.linkedin.com/company/hashrate-space"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.social.linkedin")}
              >
                <SocialLinkedIn />
              </a>
              <a
                className="market-corp-social__btn"
                href="https://x.com/Hashrate_Space"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("footer.social.x")}
              >
                <SocialX />
              </a>
            </div>
          </div>
          <div className="market-corp-contact-wp__col">
            <form className="market-corp-form-wp" onSubmit={submitForm}>
              <label className="market-corp-form-wp__field">
                <span className="sr-only">{t("corp.form.name")}</span>
                <input
                  name="name"
                  required
                  autoComplete="given-name"
                  placeholder={t("corp.form.name")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="market-corp-form-wp__field">
                <span className="sr-only">{t("corp.form.last_name")}</span>
                <input
                  name="last"
                  required
                  autoComplete="family-name"
                  placeholder={t("corp.form.last_name")}
                  value={form.last}
                  onChange={(e) => setForm((f) => ({ ...f, last: e.target.value }))}
                />
              </label>
              <label className="market-corp-form-wp__field">
                <span className="sr-only">{t("corp.form.email")}</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder={t("corp.form.email")}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="market-corp-form-wp__field">
                <span className="sr-only">{t("corp.form.subject")}</span>
                <input
                  name="subject"
                  required
                  placeholder={t("corp.form.subject")}
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </label>
              <label className="market-corp-form-wp__field">
                <span className="sr-only">{t("corp.form.phone")}</span>
                <input
                  name="phone"
                  required
                  autoComplete="tel"
                  placeholder={t("corp.form.phone")}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="market-corp-form-wp__field market-corp-form-wp__field--full">
                <span className="sr-only">{t("corp.form.message")}</span>
                <textarea
                  name="message"
                  rows={5}
                  maxLength={2000}
                  placeholder={t("corp.form.message")}
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </label>
              <p className="market-corp-form-wp__hint">{t("corp.form.hint")}</p>
              {formError ? (
                <p className="market-corp-form-wp__msg market-corp-form-wp__msg--error" role="alert">
                  {formError}
                </p>
              ) : null}
              {formSuccess ? (
                <p className="market-corp-form-wp__msg market-corp-form-wp__msg--success" role="status">
                  {successWasSimulated ? t("corp.form.success_simulated") : t("corp.form.success")}
                </p>
              ) : null}
              <button
                type="submit"
                className="market-corp-btn market-corp-btn--submit"
                disabled={submitting}
              >
                {submitting ? t("corp.form.sending") : t("corp.form.submit")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A3.5 3.5 0 1 1 8.5 11 3.5 3.5 0 0 1 12 7.5zm0 2A1.5 1.5 0 1 0 13.5 11 1.5 1.5 0 0 0 12 9.5zm5.25-3.75a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"
      />
    </svg>
  );
}

function SocialLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V23h-4V8zm7.5 0h3.8v2h.05c.53-1 1.84-2.31 3.8-2.31 4.06 0 4.8 2.67 4.8 6.14V23h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.1V23h-4V8z"
      />
    </svg>
  );
}

function SocialX() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}
