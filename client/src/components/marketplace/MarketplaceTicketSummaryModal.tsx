import type { SubmittedConsultationSummary } from "../../contexts/MarketplaceQuoteCartContext.js";
import { useMarketplaceQuoteCart } from "../../contexts/MarketplaceQuoteCartContext.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { useAuth } from "../../contexts/AuthContext.js";
import { marketplaceLocale } from "../../lib/i18n.js";

type Props = {
  summary: SubmittedConsultationSummary;
  onClose: () => void;
};

export function MarketplaceTicketSummaryModal({ summary, onClose }: Props) {
  const { openDrawerOrders } = useMarketplaceQuoteCart();
  const { user } = useAuth();
  const { lang, t, tf } = useMarketplaceLang();
  const loc = marketplaceLocale(lang);
  const stKey = `orders.status.${summary.status}`;
  const stTranslated = t(stKey);
  const stLabel = stTranslated !== stKey ? stTranslated : summary.status;
  const userEmail = user?.email?.trim() || "—";
  const userCelular = user?.celular?.trim();
  const userTelefono = user?.telefono?.trim();
  const salesContactNotice = userCelular
    ? tf("orders.contact_status_email_whatsapp", { email: userEmail, whatsapp: userCelular })
    : userTelefono
      ? tf("orders.contact_status_email_phone", { email: userEmail, phone: userTelefono })
      : tf("orders.contact_status_email", { email: userEmail });

  return (
    <div className="market-ticket-summary-root" role="dialog" aria-modal="true" aria-labelledby="market-ticket-summary-title">
      <button type="button" className="market-ticket-summary__backdrop" aria-label={t("ticket.close")} onClick={onClose} />
      <div className="market-ticket-summary__card market-ticket-summary__invoice">
        <div className="market-ticket-summary__invoice-top" aria-hidden />
        <p className="market-ticket-summary__kicker">{t("ticket.invoice_kicker")}</p>
        <h2 id="market-ticket-summary-title" className="market-ticket-summary__title">
          {t("ticket.summary_title")}
        </h2>
        <p className="market-ticket-summary__lede">
          {t("ticket.summary_lede_before")}{" "}
          <strong>{t("drawer.pending_orders")}</strong>
          {t("ticket.summary_lede_after")}
        </p>
        <div className="market-ticket-summary__sales-note" role="status" aria-live="polite">
          <p className="market-ticket-summary__sales-note-title">{t("ticket.sales_notice_title")}</p>
          <p className="market-ticket-summary__sales-note-text">{salesContactNotice}</p>
        </div>

        <div className="market-ticket-summary__codes" aria-label={t("ticket.invoice_kicker")}>
          <div className="market-ticket-summary__code-box">
            <span className="market-ticket-summary__lbl">{t("ticket.order_lbl")}</span>
            <strong className="market-ticket-summary__code-val">{summary.orderNumber}</strong>
          </div>
          <div className="market-ticket-summary__code-box">
            <span className="market-ticket-summary__lbl">{t("ticket.code_lbl")}</span>
            <strong className="market-ticket-summary__code-val">{summary.ticketCode}</strong>
          </div>
        </div>

        <div className="market-ticket-summary__meta-wrap">
          <dl className="market-ticket-summary__meta">
            <div className="market-ticket-summary__meta-row">
              <dt>{t("ticket.meta_status")}</dt>
              <dd>{stLabel}</dd>
            </div>
            <div className="market-ticket-summary__meta-row">
              <dt>{t("ticket.meta_lines")}</dt>
              <dd>
                {summary.lineCount} · {summary.unitCount} {t("ticket.meta_units")}
              </dd>
            </div>
            <div className="market-ticket-summary__meta-row market-ticket-summary__meta-row--total">
              <dt>{t("ticket.meta_total")}</dt>
              <dd>
                <span className="market-ticket-summary__total-amt">{summary.subtotalUsd.toLocaleString(loc)} USD</span>
              </dd>
            </div>
          </dl>
        </div>

        <div className="market-ticket-summary__perforation" aria-hidden />
        <p className="market-ticket-summary__fine-print">{t("ticket.invoice_fine")}</p>

        <div className="market-ticket-summary__actions">
          <button
            type="button"
            className="market-ticket-summary__btn market-ticket-summary__btn--primary"
            onClick={onClose}
          >
            {t("ticket.accept")}
          </button>
          <button
            type="button"
            className="market-ticket-summary__btn market-ticket-summary__btn--ghost"
            onClick={() => {
              onClose();
              openDrawerOrders();
            }}
          >
            {t("ticket.btn_orders")}
          </button>
        </div>
      </div>
    </div>
  );
}
