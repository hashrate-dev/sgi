import { useEffect, useMemo, useState } from "react";
import type { AsicProduct } from "../../lib/marketplaceAsicCatalog.js";
import {
  defaultAsicShelfImageSrc,
  formatAsicProductPriceDisplay,
  normalizeConsultPriceLabelForDisplay,
  pickMarketplaceShelfSpecRows,
  publicImageUrl,
} from "../../lib/marketplaceAsicCatalog.js";
import { Link } from "react-router-dom";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { AsicDetailSvg } from "./AsicDetailIcon.js";

const EAGER_IMAGE_ABOVE_INDEX = 10;

export function AsicShelfProduct({
  product,
  productIndex,
  filteredHidden,
  onOpenModal,
  onAddToQuote,
  addToQuoteLabel,
  showPrice = true,
}: {
  product: AsicProduct;
  productIndex: number;
  filteredHidden: boolean;
  onOpenModal: (index: number) => void;
  /** Solo marketplace cliente: agrega al carrito de cotización. */
  onAddToQuote?: (product: AsicProduct) => void;
  /** Texto del botón cotización; si no se pasa, usa i18n del marketplace. */
  addToQuoteLabel?: string;
  /** Oculta precio para visitantes sin sesión. */
  showPrice?: boolean;
}) {
  const { lang, t, tf } = useMarketplaceLang();
  const quoteLabel = addToQuoteLabel ?? t("catalog.add_short");
  const explicit = (product.imageSrc ?? "").trim();
  const fallbackPath = defaultAsicShelfImageSrc(product.brand, product.model);
  const [imgSrc, setImgSrc] = useState(() => publicImageUrl(explicit || fallbackPath));
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    const ex = (product.imageSrc ?? "").trim();
    const fb = defaultAsicShelfImageSrc(product.brand, product.model);
    setImgSrc(publicImageUrl(ex || fb));
    setImgBroken(false);
  }, [product.id, product.imageSrc, product.brand, product.model]);

  const hasPhoto = Boolean((explicit || fallbackPath).trim()) && !imgBroken;
  const ariaLabel = tf("shelf.seemore_aria", { model: product.model, hash: product.hashrate });
  const consultLabel = product.priceDisplayLabel?.trim()
    ? normalizeConsultPriceLabelForDisplay(product.priceDisplayLabel.trim())
    : "";
  const lockedPriceLabel = lang === "en"
    ? "Login to view price"
    : lang === "pt"
      ? "Faca login para ver o preco"
      : "Registrate para ver precio";
  const lockedPriceHint = lang === "en"
    ? "Sign in and unlock this price"
    : lang === "pt"
      ? "Faca login e desbloqueie o preco"
      : "Inicia sesion y desbloquea el precio";
  const lockedPriceCta = lang === "en" ? "Sign in now" : lang === "pt" ? "Entrar agora" : "Iniciar sesion";
  const eagerImg = productIndex < EAGER_IMAGE_ABOVE_INDEX;

  /** Potencia, monedas/algo, aire/hydro, minería Bitcoin/Dual/Zcash (`mp_detail_rows_json`). */
  const specChips = useMemo(() => pickMarketplaceShelfSpecRows(product.detailRows), [product.detailRows]);

  if (filteredHidden) {
    return <article className="shelf-product shelf-product--filtered-out" aria-hidden />;
  }

  return (
    <article className="shelf-product" data-algo={product.algo} data-product-index={productIndex}>
      <div className="shelf-product__media">
        <div className="shelf-product__media-inner">
          <button type="button" className="shelf-product__imglink" aria-label={ariaLabel} onClick={() => onOpenModal(productIndex)}>
            {!hasPhoto || imgBroken ? (
              <div className="shelf-product__photo shelf-product__photo--fallback" aria-hidden />
            ) : (
              <img
                src={imgSrc}
                alt=""
                width={400}
                height={400}
                loading={eagerImg ? "eager" : "lazy"}
                decoding="async"
                {...(eagerImg ? { fetchPriority: productIndex === 0 ? ("high" as const) : ("auto" as const) } : {})}
                className="shelf-product__photo"
                onError={() => {
                  if (explicit && fallbackPath && imgSrc === publicImageUrl(explicit)) {
                    setImgSrc(publicImageUrl(fallbackPath));
                    return;
                  }
                  setImgBroken(true);
                }}
              />
            )}
          </button>
        </div>
      </div>
      <div className="shelf-product__body">
        <div className="shelf-product__title-block">
          <h3 className="shelf-product__title-line">
            <span className="shelf-product__title-brand">{product.brand}</span> {product.model}
          </h3>
          <p className="shelf-product__subtitle">{product.hashrate}</p>
        </div>
        <div className="shelf-product__price-stack">
          {showPrice ? (
            <span
              className={
                "shelf-product__price-current" + (consultLabel ? " shelf-product__price-current--consult" : "")
              }
            >
              {formatAsicProductPriceDisplay(product, lang)}
            </span>
          ) : (
            <div className="shelf-product__price-locked" role="note" aria-label={lockedPriceLabel}>
              <span className="shelf-product__price-locked-main">{lockedPriceLabel}</span>
              <span className="shelf-product__price-locked-hint">{lockedPriceHint}</span>
              <Link
                to="/marketplace/login"
                className="shelf-product__price-locked-cta"
                aria-label={lockedPriceCta}
              >
                <i className="bi bi-shield-lock-fill" aria-hidden />
                {lockedPriceCta}
              </Link>
            </div>
          )}
        </div>
        {specChips.length > 0 ? (
          <ul className="shelf-product__chip-row" aria-label={t("shelf.chips_aria")}>
            {specChips.map((row, i) => (
              <li key={i} className="shelf-product__chip">
                <AsicDetailSvg kind={row.icon} />
                <span className="shelf-product__chip-txt">{row.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="shelf-product__cta-row">
          <button type="button" className="shelf-product__cta" onClick={() => onOpenModal(productIndex)}>
            {t("shelf.seemore")}
          </button>
          {onAddToQuote ? (
            <button
              type="button"
              className="shelf-product__quote-btn"
              onClick={() => onAddToQuote(product)}
              title={t("shelf.add_title")}
            >
              {quoteLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
