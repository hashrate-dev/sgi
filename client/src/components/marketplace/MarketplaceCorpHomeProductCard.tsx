import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AsicProduct } from "../../lib/marketplaceAsicCatalog.js";
import {
  defaultAsicShelfImageSrc,
  formatAsicProductPriceDisplay,
  marketplaceShelfImageApiUrl,
  normalizeMarketplaceImageSrc,
  pickMarketplaceShelfSpecRows,
  resolveShelfDisplayImageSrc,
} from "../../lib/marketplaceAsicCatalog.js";
import { useMarketplaceLang } from "../../contexts/MarketplaceLanguageContext.js";
import { MARKETPLACE } from "../../lib/marketplacePaths.js";
import { AsicDetailSvg } from "./AsicDetailIcon.js";

/** Tarjeta ASIC de la home corporativa (marco verde + degradé), distinta del catálogo `/equipment`. */
export function MarketplaceCorpHomeProductCard({
  product,
  productIndex,
  showPrice,
  hiddenPriceLabel,
}: {
  product: AsicProduct;
  productIndex: number;
  showPrice: boolean;
  hiddenPriceLabel: string;
}) {
  const { lang, t } = useMarketplaceLang();
  const navigate = useNavigate();
  const to = `${MARKETPLACE.catalog}?asic=${encodeURIComponent(product.id)}`;
  const aria = `${product.brand} ${product.model} ${product.hashrate} — ${t("corp.mp_card_link_aria")}`;
  const specRows = useMemo(() => pickMarketplaceShelfSpecRows(product.detailRows), [product.detailRows]);
  const consultLabel = product.priceDisplayLabel?.trim();
  const goAsic = () => {
    void navigate(to);
  };

  const { primarySrc, fallbackSrc, apiSrc } = useMemo(() => {
    const fb = normalizeMarketplaceImageSrc(defaultAsicShelfImageSrc(product.brand, product.model));
    const api = marketplaceShelfImageApiUrl(product.id);
    const primary = resolveShelfDisplayImageSrc(product);
    return { primarySrc: primary, fallbackSrc: fb, apiSrc: api };
  }, [product.id, product.imageSrc, product.brand, product.model]);

  const [imgSrc, setImgSrc] = useState(() => primarySrc);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgSrc(primarySrc);
    setImgBroken(false);
  }, [primarySrc]);

  const hasPhoto = Boolean(primarySrc.trim()) && !imgBroken;
  const eager = productIndex < 2;

  return (
    <article className="shelf-product shelf-product--corp-home" data-algo={product.algo}>
      <div className="shelf-product__media">
        <div className="shelf-product__media-gradient">
          <Link to={to} className="shelf-product__imglink" aria-label={aria}>
            {hasPhoto ? (
              <img
                src={imgSrc}
                alt=""
                width={400}
                height={400}
                loading={eager ? "eager" : "lazy"}
                fetchPriority={eager ? "high" : "auto"}
                decoding="async"
                className="shelf-product__photo"
                onError={() => {
                  if (imgSrc !== apiSrc && apiSrc) {
                    setImgSrc(apiSrc);
                    return;
                  }
                  if (fallbackSrc && imgSrc !== fallbackSrc) {
                    setImgSrc(fallbackSrc);
                    return;
                  }
                  setImgBroken(true);
                }}
              />
            ) : (
              <div className="shelf-product__photo shelf-product__photo--fallback" aria-hidden />
            )}
          </Link>
        </div>
      </div>
      <div className="shelf-product__body">
        <div className="shelf-product__identity">
          <p className="shelf-product__brand">{product.brand}</p>
          <h3 className="shelf-product__title">{product.model}</h3>
          <p className="shelf-product__hashrate">{product.hashrate}</p>
        </div>
        <div className="shelf-product__price-box">
          <span
            className={
              "shelf-product__price-value" + (consultLabel && showPrice ? " shelf-product__price-value--consult" : "")
            }
          >
            {showPrice ? formatAsicProductPriceDisplay(product, lang) : hiddenPriceLabel}
          </span>
        </div>
        <div className="shelf-product__specs-box" role="group" aria-label={t("shelf.techspecs")}>
          <ul className="shelf-detail-strip">
            {specRows.map((row, i) => (
              <li key={i} className="shelf-detail-strip__row">
                <AsicDetailSvg kind={row.icon} />
                <span className="shelf-detail-strip__txt">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shelf-product__cta-row">
          <button type="button" className="shelf-product__cta" onClick={goAsic}>
            {t("shelf.seemore")}
          </button>
          <button type="button" className="shelf-product__quote-btn" onClick={goAsic} title={t("shelf.add_title")}>
            {t("catalog.add_short")}
          </button>
        </div>
      </div>
    </article>
  );
}
