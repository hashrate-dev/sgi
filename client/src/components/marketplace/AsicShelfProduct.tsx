import { useState } from "react";
import type { AsicProduct } from "../../lib/marketplaceAsicCatalog.js";
import { formatAsicPriceUsd } from "../../lib/marketplaceAsicCatalog.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { AsicDetailSvg } from "./AsicDetailIcon.js";

export function AsicShelfProduct({
  product,
  productIndex,
  filteredHidden,
  onOpenModal,
  onAddToQuote,
  addToQuoteLabel,
}: {
  product: AsicProduct;
  productIndex: number;
  filteredHidden: boolean;
  onOpenModal: (index: number) => void;
  /** Solo marketplace cliente: agrega al carrito de cotización. */
  onAddToQuote?: (product: AsicProduct) => void;
  /** Texto del botón cotización; si no se pasa, usa i18n del marketplace. */
  addToQuoteLabel?: string;
}) {
  const { lang, t, tf } = useMarketplaceLang();
  const quoteLabel = addToQuoteLabel ?? t("catalog.add_short");
  const [imgBroken, setImgBroken] = useState(false);
  const hasPhoto = Boolean(product.imageSrc?.trim());
  const ariaLabel = tf("shelf.seemore_aria", { model: product.model, hash: product.hashrate });

  if (filteredHidden) {
    return <article className="shelf-product shelf-product--filtered-out" aria-hidden />;
  }

  return (
    <article className="shelf-product" data-algo={product.algo} data-product-index={productIndex}>
      <div className="shelf-product__media">
        <div className="shelf-product__media-gradient">
          <button type="button" className="shelf-product__imglink" aria-label={ariaLabel} onClick={() => onOpenModal(productIndex)}>
            {!hasPhoto || imgBroken ? (
              <div className="shelf-product__photo shelf-product__photo--fallback" aria-hidden />
            ) : (
              <img
                src={product.imageSrc}
                alt=""
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                className="shelf-product__photo"
                onError={() => setImgBroken(true)}
              />
            )}
          </button>
        </div>
      </div>
      <div className="shelf-product__body">
        <div className="shelf-product__identity">
          <p className="shelf-product__brand">{product.brand}</p>
          <h3 className="shelf-product__title">{product.model}</h3>
          <p className="shelf-product__hashrate">{product.hashrate}</p>
        </div>
        <div className="shelf-product__price-box">
          <span className="shelf-product__price-value">{formatAsicPriceUsd(product.priceUsd, lang)}</span>
        </div>
        <div className="shelf-product__specs-box" role="group" aria-label={t("shelf.techspecs")}>
          <ul className="shelf-detail-strip">
            {product.detailRows.map((row, i) => (
              <li key={i} className="shelf-detail-strip__row">
                <AsicDetailSvg kind={row.icon} />
                <span className="shelf-detail-strip__txt">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
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
