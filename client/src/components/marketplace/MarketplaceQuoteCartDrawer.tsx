import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMarketplaceQuoteCart } from "../../contexts/MarketplaceQuoteCartContext.js";
import type { SubmittedConsultationSummary } from "../../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceTicketSummaryModal } from "./MarketplaceTicketSummaryModal.js";
import {
  quoteCartSubtotalUsd,
  quoteCartLineSubtotalUsd,
  quoteCartLineKey,
  lineHashrateSharePct,
  quoteCartSetupUnitUsd,
  QUOTE_ADDON_WARRANTY_USD,
} from "../../lib/marketplaceQuoteCart.js";
import { MailCtaIcon, WhatsAppCtaIcon } from "./MarketplaceCtaIcons.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../../lib/i18n.js";

function EmptyCartIllustration() {
  return (
    <div className="market-quote-drawer__empty-art" aria-hidden>
      <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18" y="28" width="84" height="56" rx="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path d="M38 28V22a8 8 0 0116 0v6M66 28V22a8 8 0 0116 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
        <circle cx="48" cy="58" r="6" stroke="currentColor" strokeWidth="2" opacity="0.35" />
        <circle cx="72" cy="58" r="6" stroke="currentColor" strokeWidth="2" opacity="0.35" />
        <path d="M54 64h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      </svg>
    </div>
  );
}

export function MarketplaceQuoteCartDrawer() {
  const {
    lines,
    drawerOpen,
    closeDrawer,
    setLineQty,
    removeLine,
    setLineAddons,
    clearCart,
    ticketRef,
    openQuoteEmail,
    openQuoteWhatsApp,
    submitConsultationTicket,
    canUseQuoteCart,
    setupEquipoCompletoUsd,
    setupCompraHashrateUsd,
  } = useMarketplaceQuoteCart();
  const { lang, t, tf } = useMarketplaceLang();
  const loc = marketplaceLocale(lang);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [contactBusy, setContactBusy] = useState<null | "email" | "wa">(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [ticketSummary, setTicketSummary] = useState<SubmittedConsultationSummary | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  const pricing = { setupEquipoCompletoUsd, setupCompraHashrateUsd };
  const totalRef = quoteCartSubtotalUsd(lines, pricing);
  const n = lines.length;
  const subtitle =
    n === 0 ? null : n === 1 ? t("drawer.sub_one") : tf("drawer.sub_many", { n: String(n) });

  return (
    <>
    <div className="market-quote-drawer-root" role="dialog" aria-modal="true" aria-labelledby="market-quote-drawer-title">
      <button
        type="button"
        className="market-quote-drawer__backdrop"
        aria-label={t("drawer.close_aria")}
        onClick={closeDrawer}
      />
      <div ref={panelRef} id="market-quote-drawer-panel" className="market-quote-drawer__panel">
        <div className="market-quote-drawer__top">
          <div className="market-quote-drawer__head">
            <div className="market-quote-drawer__head-text">
              <h2 id="market-quote-drawer-title" className="market-quote-drawer__title">
                {t("drawer.title")}
              </h2>
              {subtitle ? <p className="market-quote-drawer__subtitle">{subtitle}</p> : null}
            </div>
            <button ref={closeBtnRef} type="button" className="market-quote-drawer__close" onClick={closeDrawer} aria-label={t("drawer.close")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="market-quote-drawer__lede-wrap">
            <p className="market-quote-drawer__lede">
              Llená tu carrito con los equipos que quieras:
            </p>
            {!canUseQuoteCart ? (
              <p className="market-quote-drawer__login-hint" role="note">
                Para agregar equipos y guardar tu pedido en el sistema,{" "}
                <Link to="/marketplace/login">iniciá sesión</Link> con tu cuenta , o si no tenés cuenta,{" "}
                <Link to="/marketplace/registro">creá una cuenta nueva</Link>.
              </p>
            ) : null}
          </div>
        </div>

        <div className="market-quote-drawer__body">
          {n === 0 ? (
            <div className="market-quote-drawer__empty">
              <EmptyCartIllustration />
              <p className="market-quote-drawer__empty-title">{t("drawer.empty_title")}</p>
              <p className="market-quote-drawer__hint">{t("drawer.empty_hint")}</p>
            </div>
          ) : (
            <>
              <p className="market-quote-drawer__section-label">{t("drawer.selected")}</p>
              <ul className="market-quote-drawer__list">
                {lines.map((l) => {
                  const lk = quoteCartLineKey(l);
                  const sharePct = lineHashrateSharePct(l);
                  const addonMult = sharePct / 100;
                  const setupUnit = quoteCartSetupUnitUsd(l, pricing);
                  const warrantyUnit = Math.round(QUOTE_ADDON_WARRANTY_USD * addonMult);
                  return (
                  <li key={lk} className="market-quote-drawer__line">
                    <div className="market-quote-drawer__line-top">
                      <h3 className="market-quote-drawer__line-name">
                        {l.brand} {l.model}
                      </h3>
                      <button
                        type="button"
                        className="market-quote-drawer__remove"
                        onClick={() => removeLine(lk)}
                        aria-label={tf("drawer.remove_aria", { model: l.model })}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                        <span className="market-quote-drawer__remove-txt">{t("drawer.remove")}</span>
                      </button>
                    </div>
                    <p className="market-quote-drawer__line-meta">{l.hashrate}</p>
                    {sharePct < 100 ? (
                      <p className="market-quote-drawer__line-share small text-muted mb-1">
                        {tf("drawer.line_hashrate_share", { pct: String(sharePct) })}
                      </p>
                    ) : null}
                    <div className="market-quote-drawer__line-mid">
                      <span className="market-quote-drawer__line-unit">
                        {l.priceLabel}
                        <span className="market-quote-drawer__line-unit-suffix">{t("drawer.per_unit")}</span>
                      </span>
                      <div className="market-quote-drawer__stepper" role="group" aria-label={tf("drawer.qty_aria", { model: l.model })}>
                        <button
                          type="button"
                          className="market-quote-drawer__stepper-btn"
                          disabled={l.qty <= 1}
                          onClick={() => setLineQty(lk, l.qty - 1)}
                          aria-label={t("drawer.qty_minus")}
                        >
                          −
                        </button>
                        <span className="market-quote-drawer__stepper-val" aria-live="polite">
                          {l.qty}
                        </span>
                        <button
                          type="button"
                          className="market-quote-drawer__stepper-btn"
                          disabled={l.qty >= 99}
                          onClick={() => setLineQty(lk, l.qty + 1)}
                          aria-label={t("drawer.qty_plus")}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="market-quote-drawer__addons" role="group" aria-label={tf("drawer.addons_aria", { model: l.model })}>
                      <p className="market-quote-drawer__addons-hint">{t("drawer.addons_hint")}</p>
                      <label className="market-quote-drawer__addon">
                        <input
                          type="checkbox"
                          checked={l.includeSetup}
                          onChange={(e) => setLineAddons(lk, { includeSetup: e.target.checked })}
                        />
                        <span>
                          {t("drawer.setup")}{" "}
                          <span className="market-quote-drawer__addon-price">
                            {setupUnit.toLocaleString(loc)} USD
                          </span>{" "}
                          {t("drawer.per_u")}
                        </span>
                      </label>
                      <label className="market-quote-drawer__addon">
                        <input
                          type="checkbox"
                          checked={l.includeWarranty}
                          onChange={(e) => setLineAddons(lk, { includeWarranty: e.target.checked })}
                        />
                        <span>
                          {t("drawer.warranty")}{" "}
                          <span className="market-quote-drawer__addon-price">
                            {warrantyUnit.toLocaleString(loc)} USD
                          </span>{" "}
                          {t("drawer.per_u")}
                        </span>
                      </label>
                    </div>
                    <div className="market-quote-drawer__line-sub">
                      <span>{t("drawer.subtotal")}</span>
                      <strong className="market-quote-drawer__line-sub-amt">
                        {quoteCartLineSubtotalUsd(l, pricing).toLocaleString(loc)} USD
                      </strong>
                    </div>
                  </li>
                  );
                })}
              </ul>
              <div className="market-quote-drawer__total">
                <div className="market-quote-drawer__total-copy">
                  <span className="market-quote-drawer__total-label">{t("drawer.total")}</span>
                  <span className="market-quote-drawer__total-note">{t("drawer.total_note")}</span>
                </div>
                <strong className="market-quote-drawer__total-amt">{totalRef.toLocaleString(loc)} USD</strong>
              </div>
              {ticketRef ? (
                <p className="market-quote-drawer__ticket-ref" aria-live="polite">
                  <span className="market-quote-drawer__ticket-ref-label">{t("drawer.ref_label")}</span>
                  <span className="market-quote-drawer__ticket-ref-codes">
                    <strong>{ticketRef.orderNumber}</strong>
                    <span className="market-quote-drawer__ticket-ref-sep">·</span>
                    <span>{ticketRef.ticketCode}</span>
                  </span>
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="market-quote-drawer__foot">
          <p className="market-quote-drawer__foot-kicker">{t("drawer.next")}</p>
          <p className="market-quote-drawer__foot-lede">
            {canUseQuoteCart ? t("drawer.next_logged") : t("drawer.next_guest")}
          </p>
          <div className="market-quote-drawer__cta">
            {canUseQuoteCart && n > 0 ? (
              <div className="market-quote-drawer__cta-submit-wrap">
                <button
                  type="button"
                  className="market-quote-drawer__btn market-quote-drawer__btn--solid"
                  disabled={submitBusy || contactBusy !== null}
                  onClick={() => {
                    setSubmitErr("");
                    setSubmitBusy(true);
                    void submitConsultationTicket()
                      .then((s) => {
                        setTicketSummary(s);
                      })
                      .catch((e) => {
                        setSubmitErr(e instanceof Error ? e.message : t("drawer.err_ticket"));
                      })
                      .finally(() => setSubmitBusy(false));
                  }}
                >
                  {submitBusy ? t("drawer.gen_busy") : t("drawer.gen_ticket")}
                </button>
              </div>
            ) : null}
            {submitErr ? (
              <p className="market-quote-drawer__submit-err" role="alert">
                {submitErr}
              </p>
            ) : null}
            {canUseQuoteCart ? (
              <div className="market-quote-drawer__cta-pair">
                <button
                  type="button"
                  className="market-quote-drawer__btn market-quote-drawer__btn--neutral"
                  disabled={contactBusy !== null || submitBusy || n === 0}
                  aria-label={contactBusy === "email" ? t("drawer.email_opening") : t("drawer.email_aria")}
                  onClick={() => {
                    setContactBusy("email");
                    void openQuoteEmail().finally(() => setContactBusy(null));
                  }}
                >
                  <span className="market-quote-drawer__btn-icon" aria-hidden>
                    <MailCtaIcon />
                  </span>
                  {contactBusy === "email" ? t("drawer.opening") : t("drawer.email")}
                </button>
                <button
                  type="button"
                  className="market-quote-drawer__btn market-quote-drawer__btn--solid"
                  disabled={contactBusy !== null || submitBusy || n === 0}
                  aria-label={contactBusy === "wa" ? t("drawer.wa_opening") : t("drawer.wa_aria")}
                  onClick={() => {
                    setContactBusy("wa");
                    void openQuoteWhatsApp().finally(() => setContactBusy(null));
                  }}
                >
                  <span className="market-quote-drawer__btn-icon" aria-hidden>
                    <WhatsAppCtaIcon />
                  </span>
                  {contactBusy === "wa" ? t("drawer.opening") : t("drawer.wa")}
                </button>
              </div>
            ) : (
              <Link to="/marketplace/login" className="market-quote-drawer__btn market-quote-drawer__btn--solid text-center text-decoration-none">
                {t("drawer.login_cta")}
              </Link>
            )}
            {n > 0 && canUseQuoteCart ? (
              <button type="button" className="market-quote-drawer__btn market-quote-drawer__btn--ghost" onClick={clearCart} disabled={submitBusy}>
                {t("drawer.clear")}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
    {ticketSummary ? (
      <MarketplaceTicketSummaryModal summary={ticketSummary} onClose={() => setTicketSummary(null)} />
    ) : null}
    </>
  );
}
