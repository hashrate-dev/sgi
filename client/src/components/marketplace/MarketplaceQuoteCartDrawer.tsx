import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMarketplaceQuoteCart } from "../../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceCartOrdersPanel } from "./MarketplaceCartOrdersPanel.js";
import { isOneActiveOrderError } from "../../lib/api.js";
import type { SubmittedConsultationSummary } from "../../contexts/MarketplaceQuoteCartContext.js";
import { MarketplaceTicketSummaryModal } from "./MarketplaceTicketSummaryModal.js";
import {
  quoteCartSubtotalUsd,
  quoteCartLineSubtotalUsd,
  quoteCartLineKey,
  lineHashrateSharePct,
  quoteCartSetupUnitUsd,
  quoteCartWarrantyUnitUsd,
  marketplaceQuoteTicketLineDisplayName,
  quoteCartLineIsEquipmentPricePending,
  quoteCartHasEquipmentPricePending,
  quoteCartHasMixedPricedAndConsultLines,
} from "../../lib/marketplaceQuoteCart.js";
import { MailCtaIcon, WhatsAppCtaIcon } from "./MarketplaceCtaIcons.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { marketplaceLocale } from "../../lib/i18n.js";
import { useAuth } from "../../contexts/AuthContext.js";
import { enforceSingleMarketplaceOrderForRole } from "../../lib/auth.js";

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
    garantiaQuoteItems,
    blockingPipelineOrder,
    refreshActiveOrderGate,
    drawerSubView,
    switchDrawerToOrders,
    switchDrawerToCart,
  } = useMarketplaceQuoteCart();
  const { lang, t, tf } = useMarketplaceLang();
  const loc = marketplaceLocale(lang);
  const { user } = useAuth();
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

  useEffect(() => {
    if (drawerOpen && canUseQuoteCart) void refreshActiveOrderGate();
  }, [drawerOpen, canUseQuoteCart, refreshActiveOrderGate]);

  if (!drawerOpen) return null;

  const pricing = { setupEquipoCompletoUsd, setupCompraHashrateUsd, garantiaItems: garantiaQuoteItems };
  const totalRef = quoteCartSubtotalUsd(lines, pricing);
  const hasPendingEquipmentPrice = quoteCartHasEquipmentPricePending(lines);
  const mixedPricedAndConsult = quoteCartHasMixedPricedAndConsultLines(lines);
  const n = lines.length;
  const subtitle =
    n === 0 ? null : n === 1 ? t("drawer.sub_one") : tf("drawer.sub_many", { n: String(n) });
  /** Orden en pipeline: cliente y admin A/B ven el aviso y el carrito se fusiona con esa orden. */
  const showPipelineOrderHint = Boolean(canUseQuoteCart && blockingPipelineOrder && n > 0);
  const showTicketRef = Boolean(ticketRef);
  /** Caja «Orden en curso» / política una orden: con ítems en carrito (cuentas con carrito marketplace). */
  const showCartPolicyFooter =
    drawerSubView === "cart" &&
    n > 0 &&
    Boolean(user && canUseQuoteCart && enforceSingleMarketplaceOrderForRole(user.role));

  /** Priorizar altura útil de la lista: encabezado/pie más bajos cuando ya hay equipos */
  const compactCartChrome = drawerSubView === "cart" && n > 0;

  return (
    <>
    <div className="market-quote-drawer-root" role="dialog" aria-modal="true" aria-labelledby="market-quote-drawer-title">
      <button
        type="button"
        className="market-quote-drawer__backdrop"
        aria-label={t("drawer.close_aria")}
        onClick={closeDrawer}
      />
      <div
        ref={panelRef}
        id="market-quote-drawer-panel"
        className={`market-quote-drawer__panel${compactCartChrome ? " market-quote-drawer__panel--has-lines" : ""}`}
      >
        {drawerSubView === "orders" ? (
          <div className="market-quote-drawer__top">
            <div className="market-quote-drawer__head market-quote-drawer__head--orders-nav">
              <button
                type="button"
                className="market-quote-drawer__back-to-cart"
                onClick={switchDrawerToCart}
              >
                <i className="bi bi-arrow-left" aria-hidden />
                <span>{t("drawer.back_to_cart")}</span>
              </button>
              <button ref={closeBtnRef} type="button" className="market-quote-drawer__close" onClick={closeDrawer} aria-label={t("drawer.close")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <h2 id="market-quote-drawer-title" className="visually-hidden">
              {t("orders.title")}
            </h2>
          </div>
        ) : (
          <div className={`market-quote-drawer__top${compactCartChrome ? " market-quote-drawer__top--compact" : ""}`}>
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
            {!canUseQuoteCart ? (
              <div className="market-quote-drawer__lede-wrap">
                <p className="market-quote-drawer__lede">{t("drawer.lede")}</p>
                <p className="market-quote-drawer__login-hint" role="note">
                  {t("drawer.hint.p1")}{" "}
                  <Link to="/marketplace/login">{t("drawer.login_link")}</Link>
                  {t("drawer.hint.p2")}
                  <Link to="/marketplace/signup">{t("drawer.register_link")}</Link>
                  {t("drawer.hint.p5")}
                </p>
              </div>
            ) : showPipelineOrderHint ? null : n === 0 ? (
              <div className="market-quote-drawer__lede-wrap">
                <p className="market-quote-drawer__lede">{t("drawer.lede")}</p>
              </div>
            ) : null}
          </div>
        )}

        <div
          className={`market-quote-drawer__body${drawerSubView === "cart" ? " market-quote-drawer__body--cart-layout" : ""}`}
        >
          {drawerSubView === "orders" ? (
            <MarketplaceCartOrdersPanel onBackToCart={switchDrawerToCart} />
          ) : (
            <>
          <div
            className={`market-quote-drawer__body-scroll${compactCartChrome ? " market-quote-drawer__body-scroll--has-lines" : ""}`}
          >
          {showPipelineOrderHint ? (
            <div className="market-quote-drawer__one-active-order" role="status">
              <p className="market-quote-drawer__one-active-order-title">{t("drawer.one_active_title")}</p>
              <p className="market-quote-drawer__one-active-order-body">{t("drawer.one_active_body")}</p>
              {blockingPipelineOrder?.orderNumber ? (
                <p className="market-quote-drawer__one-active-order-ref small text-muted mb-2">
                  <strong>{blockingPipelineOrder.orderNumber}</strong>
                  {blockingPipelineOrder.ticketCode ? (
                    <>
                      {" "}
                      · {blockingPipelineOrder.ticketCode}
                    </>
                  ) : null}
                </p>
              ) : null}
              <button
                type="button"
                className="market-quote-drawer__btn market-quote-drawer__btn--solid market-quote-drawer__one-active-order-link"
                onClick={switchDrawerToOrders}
              >
                {t("drawer.one_active_link")}
              </button>
            </div>
          ) : null}
          {n === 0 ? (
            <div className="market-quote-drawer__empty">
              <EmptyCartIllustration />
              <p className="market-quote-drawer__empty-title">{t("drawer.empty_title")}</p>
              <p className="market-quote-drawer__hint">{t("drawer.empty_hint")}</p>
              {canUseQuoteCart && blockingPipelineOrder ? (
                <p className="market-quote-drawer__empty-pending-note">
                  <button
                    type="button"
                    className="market-quote-drawer__empty-pending-link"
                    onClick={switchDrawerToOrders}
                  >
                    {t("drawer.empty_pending_order_link")}
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p id="market-quote-drawer-selected-heading" className="market-quote-drawer__section-label">
                {t("drawer.selected")}
              </p>
              <ul className="market-quote-drawer__list" aria-labelledby="market-quote-drawer-selected-heading">
                {lines.map((l, lineIdx) => {
                  const lk = quoteCartLineKey(l);
                  const sharePct = lineHashrateSharePct(l);
                  const warrantyPctRaw = Math.round(Number(l.hashrateWarrantyPct));
                  const addonMult =
                    Number.isFinite(warrantyPctRaw) && warrantyPctRaw >= 0 && warrantyPctRaw <= 100
                      ? warrantyPctRaw / 100
                      : sharePct / 100;
                  const setupUnit = quoteCartSetupUnitUsd(l, pricing);
                  const warrantyUnit = Math.round(quoteCartWarrantyUnitUsd(l, pricing) * addonMult);
                  const equipmentPricePending = quoteCartLineIsEquipmentPricePending(l);
                  return (
                  <li key={`${lk}#${lineIdx}`} className="market-quote-drawer__line">
                    <div className="market-quote-drawer__line-top">
                      <h3 className="market-quote-drawer__line-name">
                        {marketplaceQuoteTicketLineDisplayName(l as unknown as Record<string, unknown>, {
                          includeShareSuffix: false,
                        })}
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
                    {sharePct < 100 ? (
                      <p className="market-quote-drawer__line-share small text-muted mb-1">
                        {tf("drawer.line_hashrate_share", { pct: String(sharePct) })}
                      </p>
                    ) : null}
                    <div className="market-quote-drawer__line-mid">
                      <span
                        className={
                          "market-quote-drawer__line-unit" +
                          (equipmentPricePending ? " market-quote-drawer__line-unit--pending" : "")
                        }
                      >
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
                      <p className="market-quote-drawer__addons-hint">
                        {equipmentPricePending ? t("drawer.addons_hint_pending_line") : t("drawer.addons_hint")}
                      </p>
                      <label className="market-quote-drawer__addon">
                        <input
                          type="checkbox"
                          checked={l.includeSetup}
                          onChange={(e) => setLineAddons(lk, { includeSetup: e.target.checked })}
                        />
                        <span>
                          {t("drawer.setup")}
                          {equipmentPricePending ? (
                            <span className="market-quote-drawer__addon-muted"> {t("drawer.per_u")}</span>
                          ) : (
                            <>
                              {" "}
                              <span className="market-quote-drawer__addon-price">
                                {setupUnit.toLocaleString(loc)} USD
                              </span>{" "}
                              {t("drawer.per_u")}
                            </>
                          )}
                        </span>
                      </label>
                      <label className="market-quote-drawer__addon">
                        <input
                          type="checkbox"
                          checked={l.includeWarranty}
                          onChange={(e) => setLineAddons(lk, { includeWarranty: e.target.checked })}
                        />
                        <span>
                          {t("drawer.warranty")}
                          {equipmentPricePending ? (
                            <span className="market-quote-drawer__addon-muted"> {t("drawer.per_u")}</span>
                          ) : (
                            <>
                              {" "}
                              <span className="market-quote-drawer__addon-price">
                                {warrantyUnit.toLocaleString(loc)} USD
                              </span>{" "}
                              {t("drawer.per_u")}
                            </>
                          )}
                        </span>
                      </label>
                    </div>
                    <div className="market-quote-drawer__line-sub">
                      <span>{t("drawer.subtotal")}</span>
                      <strong
                        className={
                          "market-quote-drawer__line-sub-amt" +
                          (equipmentPricePending ? " market-quote-drawer__line-sub-amt--pending" : "")
                        }
                      >
                        {equipmentPricePending
                          ? t("drawer.total_pending_placeholder")
                          : `${quoteCartLineSubtotalUsd(l, pricing).toLocaleString(loc)} USD`}
                      </strong>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </>
          )}
          </div>
          {n > 0 ? (
            <div className="market-quote-drawer__cart-sticky-summary" role="region" aria-labelledby="market-quote-drawer-total-heading">
              {showTicketRef && ticketRef ? (
                <p className="market-quote-drawer__ticket-ref" aria-live="polite">
                  <span className="market-quote-drawer__ticket-ref-label">{t("drawer.ref_label")}</span>
                  <span className="market-quote-drawer__ticket-ref-codes">
                    <strong>{ticketRef.orderNumber}</strong>
                    <span className="market-quote-drawer__ticket-ref-sep">·</span>
                    <span>{ticketRef.ticketCode}</span>
                  </span>
                </p>
              ) : null}
              <div
                className={
                  "market-quote-drawer__total" +
                  (mixedPricedAndConsult ? " market-quote-drawer__total--mixed" : "")
                }
              >
                <div className="market-quote-drawer__total-copy">
                  <span id="market-quote-drawer-total-heading" className="market-quote-drawer__total-label">
                    {mixedPricedAndConsult ? t("drawer.total_mixed_label") : t("drawer.total")}
                  </span>
                  <span
                    className={
                      "market-quote-drawer__total-note" +
                      (mixedPricedAndConsult ? " market-quote-drawer__total-note--mixed" : "")
                    }
                  >
                    {mixedPricedAndConsult
                      ? t("drawer.total_note_mixed")
                      : hasPendingEquipmentPrice
                        ? t("drawer.total_note_pending_quote")
                        : t("drawer.total_note")}
                  </span>
                </div>
                <strong
                  className={
                    "market-quote-drawer__total-amt" +
                    (hasPendingEquipmentPrice && totalRef === 0 ? " market-quote-drawer__total-amt--pending" : "") +
                    (mixedPricedAndConsult ? " market-quote-drawer__total-amt--partial" : "")
                  }
                >
                  {hasPendingEquipmentPrice && totalRef === 0
                    ? t("drawer.total_pending_placeholder")
                    : `${totalRef.toLocaleString(loc)} USD`}
                </strong>
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>

        {drawerSubView === "cart" ? (
        <footer className={`market-quote-drawer__foot${compactCartChrome ? " market-quote-drawer__foot--compact" : ""}`}>
          {!compactCartChrome ? <p className="market-quote-drawer__foot-kicker">{t("drawer.next")}</p> : null}
          {!(canUseQuoteCart && compactCartChrome) ? (
            <p className="market-quote-drawer__foot-lede">
              {canUseQuoteCart ? t("drawer.next_logged") : t("drawer.next_guest")}
            </p>
          ) : null}
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
                        if (isOneActiveOrderError(e)) void refreshActiveOrderGate();
                        setSubmitErr(
                          isOneActiveOrderError(e) ? t("drawer.one_active_err") : e instanceof Error ? e.message : t("drawer.err_ticket")
                        );
                      })
                      .finally(() => setSubmitBusy(false));
                  }}
                >
                  {submitBusy
                    ? showPipelineOrderHint
                      ? t("drawer.gen_busy_update")
                      : t("drawer.gen_busy")
                    : showPipelineOrderHint
                      ? t("drawer.gen_ticket_update")
                      : t("drawer.gen_ticket")}
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
                    setSubmitErr("");
                    setContactBusy("email");
                    void openQuoteEmail()
                      .catch((e) => {
                        if (isOneActiveOrderError(e)) void refreshActiveOrderGate();
                        setSubmitErr(isOneActiveOrderError(e) ? t("drawer.one_active_err") : t("drawer.err_ticket"));
                      })
                      .finally(() => setContactBusy(null));
                  }}
                >
                  <span className="market-quote-drawer__btn-icon" aria-hidden>
                    <MailCtaIcon />
                  </span>
                  {contactBusy === "email" ? t("drawer.opening") : t("drawer.email")}
                </button>
                <button
                  type="button"
                  className="market-quote-drawer__btn market-quote-drawer__btn--contact-wa"
                  disabled={contactBusy !== null || submitBusy || n === 0}
                  aria-label={contactBusy === "wa" ? t("drawer.wa_opening") : t("drawer.wa_aria")}
                  onClick={() => {
                    setSubmitErr("");
                    setContactBusy("wa");
                    void openQuoteWhatsApp()
                      .catch((e) => {
                        if (isOneActiveOrderError(e)) void refreshActiveOrderGate();
                        setSubmitErr(isOneActiveOrderError(e) ? t("drawer.one_active_err") : t("drawer.err_ticket"));
                      })
                      .finally(() => setContactBusy(null));
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
          {showCartPolicyFooter ? (
            <div className="market-quote-drawer__cart-policy" role="note">
              <span className="market-quote-drawer__cart-policy-icon" aria-hidden>
                <i className="bi bi-shield-check" />
              </span>
              <div className="market-quote-drawer__cart-policy-body">
                <span className="market-quote-drawer__cart-policy-title">{t("drawer.cart_policy_title")}</span>
                <span className="market-quote-drawer__cart-policy-text">{t("drawer.cart_policy_text")}</span>
              </div>
            </div>
          ) : null}
        </footer>
        ) : null}
      </div>
    </div>
    {ticketSummary ? (
      <MarketplaceTicketSummaryModal summary={ticketSummary} onClose={() => setTicketSummary(null)} />
    ) : null}
    </>
  );
}
