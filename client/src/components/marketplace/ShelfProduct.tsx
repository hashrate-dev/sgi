import { useState } from "react";
import { t } from "../../lib/i18n.js";
import type { CatalogItem } from "../../lib/productUtils.js";

export function ShelfProduct({
  product,
  lang,
  productIndex,
  filteredHidden,
  onRequest,
}: {
  product: CatalogItem;
  lang: string;
  productIndex: number;
  filteredHidden: boolean;
  onRequest: (idx: number) => void;
}) {
  if (filteredHidden) {
    return <div className="shelf-card shelf-card--filtered-out" aria-hidden />;
  }

  const price = typeof product.priceUsd === "number" ? product.priceUsd : null;
  const [imgBroken, setImgBroken] = useState(false);
  const showImg = product.image && !imgBroken;

  return (
    <article className="shelf-card">
      <div className="shelf-card__media">
        {showImg ? (
          <img
            src={String(product.image)}
            alt=""
            className="shelf-card__img"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        ) : (
          <div className="shelf-card__img-fallback" aria-hidden>
            <i className="bi bi-box-seam" />
          </div>
        )}
      </div>
      <div className="shelf-card__body">
        {product.algo ? <span className="shelf-card__tag">{String(product.algo)}</span> : null}
        <h3 className="shelf-card__title">{product.name}</h3>
        {product.description ? <p className="shelf-card__desc">{String(product.description)}</p> : null}
        {price != null && Number.isFinite(price) ? (
          <p className="shelf-card__price">
            {t(lang, "price.from")} {price.toLocaleString("es-UY", { style: "currency", currency: "USD" })}
          </p>
        ) : null}
        <button type="button" className="shelf-card__btn btn btn-success btn-sm w-100" onClick={() => onRequest(productIndex)}>
          {t(lang, "shelf.request")}
        </button>
      </div>
    </article>
  );
}
