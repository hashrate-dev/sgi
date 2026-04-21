import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AsicProduct } from "../../lib/marketplaceAsicCatalog.js";
import {
  asicProductShowsMinerEconomyContent,
  defaultAsicShelfImageSrc,
  formatAsicPriceUsd,
  normalizeConsultPriceLabelForDisplay,
  productHashrateShareParts,
  proratedEquipmentPriceUsd,
  productSupportsHashrateShare,
  publicImageUrl,
  scaleDetailRowTextForShare,
  scaleHashrateDisplay,
  scaleYieldDisplayLine,
  splitYieldLineByPlus,
} from "../../lib/marketplaceAsicCatalog.js";
import type { AddQuoteLineOptions } from "../../lib/marketplaceQuoteCart.js";
import type { MarketplaceAsicLiveYield } from "../../lib/api.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { AsicDetailSvg } from "./AsicDetailIcon.js";
import { BackCircleArrowIcon, MailCtaIcon, WhatsAppCtaIcon } from "./MarketplaceCtaIcons.js";
import { MarketplaceProductEmailInquiryModal } from "./MarketplaceProductEmailInquiryModal.js";

/** Varias monedas en «X + Y»: una fila por moneda y el `+` al inicio de la segunda (evita cortes feos al hacer wrap). */
function renderYieldLineParts(text: string): ReactNode {
  const parts = splitYieldLineByPlus(text);
  if (parts.length <= 1) return text;
  return (
    <span className="product-modal__yield-parts product-modal__yield-parts--stack">
      {parts.map((part, i) => (
        <span key={`${i}-${part.slice(0, 32)}`} className="product-modal__yield-chip-row">
          {i > 0 ? <span className="product-modal__yield-sep">+ </span> : null}
          {part}
        </span>
      ))}
    </span>
  );
}

/** URLs únicas para miniaturas + hero; catálogo local si la API no trae `imageSrc`. */
function gallerySources(product: AsicProduct): string[] {
  const toU = (s: string) => publicImageUrl(s);
  const main = (product.imageSrc ?? "").trim();
  const fb = defaultAsicShelfImageSrc(product.brand, product.model);
  const g = product.gallerySrcs?.map((x) => String(x).trim()).filter(Boolean) ?? [];
  const dedupe = (urls: string[]) => {
    const seen = new Set<string>();
    return urls.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  };
  if (g.length > 0) return dedupe(g.map(toU));
  if (main && fb && publicImageUrl(main) !== publicImageUrl(fb)) return dedupe([toU(main), toU(fb)]);
  if (main) return [toU(main)];
  if (fb) return [toU(fb)];
  return [];
}

export function AsicProductModal({
  product,
  onClose,
  liveYield,
  liveYieldLoading,
  inventoryAside,
  storeTitle,
  storeSub,
  onAddToQuote,
  addToQuoteLabel,
  showPrice = true,
}: {
  product: AsicProduct;
  onClose: () => void;
  liveYield?: MarketplaceAsicLiveYield;
  liveYieldLoading?: boolean;
  /** Reemplaza CTA + tarjeta hosting (p. ej. ficha de inventario en Gestión ASIC). */
  inventoryAside?: ReactNode;
  storeTitle?: string;
  storeSub?: string;
  /** Solo tienda pública: agrega ítem y abre panel de cotización. */
  onAddToQuote?: (product: AsicProduct, opts?: AddQuoteLineOptions) => void;
  addToQuoteLabel?: string;
  /** Oculta precio para visitantes sin sesión. */
  showPrice?: boolean;
}) {
  const { lang, t, tf } = useMarketplaceLang();
  const showMinerEconomy = asicProductShowsMinerEconomyContent(product);
  const quoteLabel = addToQuoteLabel ?? t("catalog.add_short");
  const [hashrateShareView, setHashrateShareView] = useState(false);
  const shareParts = useMemo(() => productHashrateShareParts(product), [product]);
  const [shareViewPct, setShareViewPct] = useState<number>(75);
  const shareFactor = hashrateShareView ? shareViewPct / 100 : 1;
  const displayHashrate = useMemo(
    () => scaleHashrateDisplay(product.hashrate, shareFactor, lang),
    [product.hashrate, shareFactor, lang]
  );
  const displayPriceUsd = hashrateShareView ? proratedEquipmentPriceUsd(product, shareViewPct) : product.priceUsd;
  const priceLabelNorm = product.priceDisplayLabel?.trim()
    ? normalizeConsultPriceLabelForDisplay(product.priceDisplayLabel.trim())
    : "";
  const displayPriceStr = priceLabelNorm
    ? hashrateShareView && productSupportsHashrateShare(product)
      ? `${priceLabelNorm} (${shareViewPct}%)`
      : priceLabelNorm
    : formatAsicPriceUsd(displayPriceUsd, lang);
  const hiddenPriceLabel = lang === "en"
    ? "Sign up to see the price"
    : lang === "pt"
      ? "Registre-se para ver o preço"
      : "Registrate para ver precio";
  const safePriceForDisplay = showPrice ? displayPriceStr : hiddenPriceLabel;
  const mailText = useMemo(() => {
    const subject = tf("modal.mail.subject", {
      brand: product.brand,
      model: product.model,
      hash: displayHashrate,
      price: safePriceForDisplay,
    });
    const body = tf("modal.wa.body", {
      brand: product.brand,
      model: product.model,
      hash: displayHashrate,
      price: safePriceForDisplay,
    });
    return { subject, body };
  }, [product.brand, product.model, displayHashrate, safePriceForDisplay, tf]);

  const waUrl = useMemo(() => {
    const waText = encodeURIComponent(mailText.body);
    return `https://wa.me/595993358387?text=${waText}`;
  }, [mailText.body]);

  const thumbs = useMemo(() => gallerySources(product), [product]);
  const hasAnyPhoto = thumbs.length > 0;
  const [activeThumb, setActiveThumb] = useState(0);
  const [mainBroken, setMainBroken] = useState(false);
  const [emailInquiryOpen, setEmailInquiryOpen] = useState(false);

  useEffect(() => {
    setActiveThumb(0);
    setMainBroken(false);
    setHashrateShareView(false);
    setShareViewPct(shareParts[0]?.sharePct ?? 75);
  }, [product, shareParts]);

  useEffect(() => {
    setMainBroken(false);
  }, [activeThumb]);

  /** Cada vez que se abre la vista porción, volver al 75% predeterminado. */
  useEffect(() => {
    if (hashrateShareView) setShareViewPct(shareParts[0]?.sharePct ?? 75);
  }, [hashrateShareView, shareParts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (emailInquiryOpen) {
        e.stopPropagation();
        setEmailInquiryOpen(false);
        return;
      }
      if (hashrateShareView) {
        e.stopPropagation();
        setHashrateShareView(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hashrateShareView, emailInquiryOpen]);

  const hasLive = Boolean(liveYield?.line1);
  const rawY1 = hasLive ? liveYield!.line1 : liveYieldLoading ? t("modal.yield_loading") : product.estimatedYield.line1;
  const rawY2 = hasLive ? liveYield!.line2 : liveYieldLoading ? t("modal.yield_loading") : product.estimatedYield.line2;
  const y1 =
    hashrateShareView && shareFactor < 1 && !liveYieldLoading
      ? scaleYieldDisplayLine(rawY1, shareFactor, lang)
      : rawY1;
  const y2 =
    hashrateShareView && shareFactor < 1 && !liveYieldLoading
      ? scaleYieldDisplayLine(rawY2, shareFactor, lang)
      : scaleYieldDisplayLine(rawY2, 1, lang);
  /** Pie: carga en vivo vs texto de referencia del catálogo. */
  const yieldFootShort = hashrateShareView
    ? liveYieldLoading
      ? t("modal.yield_foot_loading")
      : t("modal.yield_foot_share")
    : hasLive
      ? null
      : liveYieldLoading
        ? t("modal.yield_foot_loading")
        : t("modal.yield_foot_ref");

  const mainSrc = thumbs[Math.min(activeThumb, thumbs.length - 1)] ?? product.imageSrc;

  const chipRow = product.detailRows.find((r) => r.icon === "chip");
  const isZecProductUi = useMemo(() => {
    const blob = `${product.brand} ${product.model} ${product.hashrate} ${chipRow?.text ?? ""}`.toLowerCase();
    return /\bz15\b|\bzcash\b|\bzec\b|equihash|k.sol|ksol/.test(blob);
  }, [product.brand, product.model, product.hashrate, chipRow?.text]);
  const algoBadge = isZecProductUi
    ? { label: "Equihash", className: "product-modal__pill product-modal__pill--equihash" }
    : product.algo === "sha256"
      ? { label: "SHA-256", className: "product-modal__pill product-modal__pill--algo" }
      : { label: "Scrypt", className: "product-modal__pill product-modal__pill--algo" };
  const coinsBadge = {
    label: chipRow ? chipRow.text.split("·")[0]?.trim() ?? chipRow.text : product.algo === "sha256" ? "BTC / BCH / BSV" : "DOGE + LTC",
    className: "product-modal__pill product-modal__pill--coins",
  };

  return (
    <div className="product-modal" role="presentation">
      <div className="product-modal__backdrop" tabIndex={-1} aria-hidden onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()} />
      <div className="product-modal__frame product-modal__frame--wide">
        <div
          className="product-modal__dialog product-modal__dialog--layout"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-heading"
          aria-label={t("modal.detail_aria")}
        >
          <button type="button" className="product-modal__close" onClick={onClose} aria-label={t("modal.close_win")}>
            <span aria-hidden="true">×</span>
          </button>

          <div
            className={`product-modal__gallery${!hasAnyPhoto ? " product-modal__gallery--no-media" : ""}`}
            aria-label={hasAnyPhoto ? t("modal.gallery") : t("modal.no_photos")}
          >
            {thumbs.length > 0 ? (
              <div className="product-modal__thumbs" role="tablist" aria-label={t("modal.thumbs")}>
                {thumbs.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={activeThumb === i}
                    className={`product-modal__thumb${activeThumb === i ? " product-modal__thumb--active" : ""}`}
                    onClick={() => setActiveThumb(i)}
                  >
                    <img src={src} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="product-modal__gallery-col">
              <div className="product-modal__hero-wrap">
                <div className="product-modal__hero-gradient">
                  {!hasAnyPhoto || mainBroken ? (
                    <div className="product-modal__hero-fallback" aria-hidden />
                  ) : (
                    <img
                      src={mainSrc}
                      alt=""
                      className="product-modal__hero-img"
                      loading="eager"
                      decoding="async"
                      onError={() => {
                        if (thumbs.length > 1 && activeThumb < thumbs.length - 1) {
                          setActiveThumb((i) => i + 1);
                          return;
                        }
                        setMainBroken(true);
                      }}
                    />
                  )}
                </div>
              </div>
              {hashrateShareView && productSupportsHashrateShare(product) ? (
                <aside
                  className="product-modal__hashrate-legal product-modal__hashrate-legal--under-photo"
                  role="note"
                  aria-label={t("modal.hashrate_share_legal_title")}
                >
                  <h3 className="product-modal__hashrate-legal-title">{t("modal.hashrate_share_legal_title")}</h3>
                  <p className="product-modal__hashrate-legal-p">
                    {tf("modal.hashrate_share_legal_p1", {
                      model: `${product.brand} ${product.model}`,
                      full: product.hashrate,
                    })}
                  </p>
                  <p className="product-modal__hashrate-legal-p">
                    {tf("modal.hashrate_share_legal_p2", {
                      pct: String(shareViewPct),
                      portion: displayHashrate,
                    })}
                  </p>
                  <p className="product-modal__hashrate-legal-p">{t("modal.hashrate_share_legal_p3")}</p>
                </aside>
              ) : null}
            </div>
          </div>

          <div className="product-modal__center">
            <div className="product-modal__store-row">
              <span className="product-modal__store-name">
                {storeTitle ?? t("modal.store_official")}
                {!inventoryAside ? (
                  <span className="product-modal__verified" aria-hidden="true" title={t("modal.verified")} />
                ) : null}
              </span>
            </div>
            <p className="product-modal__store-sub">
              {storeSub ?? t("modal.store_sub")}
            </p>

            <h2 id="product-modal-heading" className="product-modal__title product-modal__title--xl">
              <span className="product-modal__title-brand">{product.brand}</span> {product.model}
            </h2>

            <div
              className={
                "product-modal__hashrate-badge" +
                (hashrateShareView ? " product-modal__hashrate-badge--share" : "")
              }
              role="status"
              aria-live="polite"
              aria-label={displayHashrate}
            >
              <p className="product-modal__hashrate product-modal__hashrate--xl product-modal__hashrate--in-badge">
                {displayHashrate}
              </p>
            </div>

            {hashrateShareView ? (
              <div className="product-modal__share-banner" role="region" aria-label={t("modal.hashrate_share_popover_title")}>
                <p className="product-modal__share-banner-lede">{tf("modal.hashrate_share_viewing", { pct: String(shareViewPct) })}</p>
                <div className="product-modal__share-picker-row">
                  <div className="product-modal__share-picker-inner">
                    <div
                      className="product-modal__hashrate-popover-pills product-modal__hashrate-popover-pills--with-result"
                      role="group"
                      aria-label={t("modal.hashrate_share_popover_title")}
                    >
                      {shareParts.map((part) => (
                        <button
                          key={part.sharePct}
                          type="button"
                          className={
                            "product-modal__hashrate-popover-pill" +
                            (shareViewPct === part.sharePct ? " product-modal__hashrate-popover-pill--active" : "")
                          }
                          aria-pressed={shareViewPct === part.sharePct}
                          onClick={() => setShareViewPct(part.sharePct)}
                        >
                          {tf("modal.hashrate_share_of", { pct: String(part.sharePct) })}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div
              className={
                "product-modal__price-box" +
                (hashrateShareView ? " product-modal__price-box--share" : "")
              }
              role="group"
              aria-label={t("modal.price_box_label")}
            >
              <span className="product-modal__price-box-label">{t("modal.price_box_label")}</span>
              <p
                className={
                  "product-modal__price product-modal__price--xl product-modal__price--in-box" +
                  (priceLabelNorm ? " product-modal__price--consult" : "")
                }
              >
                {safePriceForDisplay}
              </p>
              {showPrice ? (
                <p className="product-modal__price-note product-modal__price-note--in-box" role="note">
                  <i className="bi bi-info-circle-fill product-modal__price-note-icon" aria-hidden />
                  <span className="product-modal__price-note-txt">{t("modal.price_note")}</span>
                </p>
              ) : null}
            </div>

            <div className="product-modal__pills">
              <span className={algoBadge.className}>{algoBadge.label}</span>
              <span className={coinsBadge.className}>{coinsBadge.label}</span>
            </div>

            <div className="product-modal__spec-card" role="group" aria-label={t("modal.specs_aria")}>
              <ul className="product-modal__spec-list">
                {product.detailRows.map((r, i) => (
                  <li key={i} className="product-modal__spec-row">
                    <span className="product-modal__spec-icon">
                      <AsicDetailSvg kind={r.icon} />
                    </span>
                    <span className="product-modal__spec-txt">{scaleDetailRowTextForShare(r, shareFactor, lang)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {showMinerEconomy ? (
              <div className="product-modal__yield-card">
                <h3 className="product-modal__yield-title">{t("modal.yield_title")}</h3>
                {liveYieldLoading && !hasLive ? (
                  <p className="product-modal__yield-loading">{t("modal.yield_loading")}</p>
                ) : null}
                <div className="product-modal__yield-grid">
                  <div className="product-modal__yield-cell">
                    <span className="product-modal__yield-lbl">{t("modal.yield_daily")}</span>
                    <div className="product-modal__yield-box product-modal__yield-box--primary">{renderYieldLineParts(y1)}</div>
                  </div>
                  <div className="product-modal__yield-cell">
                    <span className="product-modal__yield-lbl">{t("modal.yield_usdt")}</span>
                    <div className="product-modal__yield-box product-modal__yield-box--secondary">{renderYieldLineParts(y2)}</div>
                  </div>
                </div>
                {yieldFootShort ? <p className="product-modal__yield-foot">{yieldFootShort}</p> : null}
                <p className="product-modal__yield-legal" role="note">
                  <i className="bi bi-info-circle-fill product-modal__yield-legal-icon" aria-hidden />
                  <span className="product-modal__yield-legal-txt">{t("modal.yield_legal_short")}</span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="product-modal__aside">
            {inventoryAside ? (
              inventoryAside
            ) : (
              <>
                <div className="product-modal__cta-block">
                  <div className="product-modal__cta-group product-modal__cta-group--contact">
                    <button
                      type="button"
                      className="product-modal__btn product-modal__btn--neutral"
                      onClick={() => setEmailInquiryOpen(true)}
                    >
                      <span className="product-modal__btn-icon" aria-hidden>
                        <MailCtaIcon />
                      </span>
                      {t("modal.email_btn")}
                    </button>
                    <a className="product-modal__btn product-modal__btn--solid" href={waUrl} target="_blank" rel="noopener noreferrer">
                      <span className="product-modal__btn-icon" aria-hidden>
                        <WhatsAppCtaIcon />
                      </span>
                      {t("modal.wa_btn")}
                    </a>
                  </div>
                  {onAddToQuote ? (
                    <div className="product-modal__cta-group product-modal__cta-group--quote">
                      {productSupportsHashrateShare(product) ? (
                        <div className="product-modal__quote-dual product-modal__quote-dual--stack">
                          {!hashrateShareView ? (
                            <>
                              <button
                                type="button"
                                className="product-modal__btn product-modal__btn--quote-cart"
                                onClick={() => onAddToQuote(product, undefined)}
                                aria-label={t("modal.add_quote_aria")}
                              >
                                {quoteLabel}
                              </button>
                              <button
                                type="button"
                                className="product-modal__btn product-modal__btn--hashrate-toggle"
                                aria-pressed={false}
                                onClick={() => {
                                  setHashrateShareView(true);
                                  setShareViewPct(shareParts[0]?.sharePct ?? 75);
                                }}
                              >
                                {t("modal.hashrate_share_btn")}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="product-modal__btn product-modal__btn--quote-cart"
                              onClick={() => onAddToQuote(product, { hashrateSharePct: shareViewPct })}
                              aria-label={t("modal.hashrate_share_add")}
                              aria-describedby="product-modal-hashrate-add-disclaimer"
                            >
                              {t("modal.hashrate_share_add_short")}
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="product-modal__btn product-modal__btn--quote-cart"
                          onClick={() => onAddToQuote(product, undefined)}
                          aria-label={t("modal.add_quote_aria")}
                        >
                          {quoteLabel}
                        </button>
                      )}
                      {productSupportsHashrateShare(product) && hashrateShareView ? (
                        <p
                          id="product-modal-hashrate-add-disclaimer"
                          className="product-modal__hashrate-add-disclaimer"
                          role="note"
                        >
                          {t("modal.hashrate_share_add_disclaimer")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {showMinerEconomy ? (
                  <div className="product-modal__host-card">
                    <h3 className="product-modal__host-title">{t("modal.host_title")}</h3>
                    <p className="product-modal__host-loc">
                      <svg className="product-modal__host-pin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M12 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M12 21s7-4.35 7-10a7 7 0 10-14 0c0 5.65 7 10 7 10z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="product-modal__host-loc-txt">{t("modal.host_loc")}</span>
                      <span className="product-modal__host-flag" role="img" aria-label={t("modal.host_flag_aria")}>
                        <svg className="product-modal__host-flag-svg" viewBox="0 0 30 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <rect width="30" height="6" y="0" fill="#D52B1E" />
                          <rect width="30" height="6" y="6" fill="#FFFFFF" />
                          <rect width="30" height="6" y="12" fill="#0038A8" />
                        </svg>
                      </span>
                    </p>
                    <div className="product-modal__host-divider" aria-hidden="true" />
                    <table className="product-modal__host-table">
                      <tbody>
                        <tr>
                          <td className="product-modal__host-label">{t("modal.host_tier1")}</td>
                          <td className="product-modal__host-value">{t("modal.host_kwh1")}</td>
                        </tr>
                        <tr>
                          <td className="product-modal__host-label">{t("modal.host_tier2")}</td>
                          <td className="product-modal__host-value">{t("modal.host_kwh2")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {hashrateShareView && onAddToQuote && productSupportsHashrateShare(product) ? (
                  <button
                    type="button"
                    className="product-modal__btn product-modal__btn--outline product-modal__hashrate-back-below-host"
                    onClick={() => setHashrateShareView(false)}
                    aria-label={t("modal.hashrate_share_back_aria")}
                  >
                    <span className="product-modal__btn-icon" aria-hidden>
                      <BackCircleArrowIcon />
                    </span>
                    {t("modal.hashrate_share_full_view")}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      <MarketplaceProductEmailInquiryModal
        open={emailInquiryOpen}
        onClose={() => setEmailInquiryOpen(false)}
        subject={mailText.subject}
        defaultBody={mailText.body}
      />
    </div>
  );
}
