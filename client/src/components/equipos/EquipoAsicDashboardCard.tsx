import { useEffect, useState } from "react";
import type { EquipoASIC } from "../../lib/types";
import {
  defaultAsicShelfImageSrc,
  formatAsicPriceUsd,
  isMarketplaceOutOfStockLabel,
  normalizeConsultPriceLabelForDisplay,
  publicImageUrl,
} from "../../lib/marketplaceAsicCatalog";
import { HASHRATE_SPACE_MARK } from "../../lib/marketplaceWpAssets";
import { AsicDetailSvg } from "../marketplace/AsicDetailIcon";
import { parseDetailRowsJson } from "./MarketplaceDetailRowsEditor";

function firstGalleryImageSrc(galleryJson: string | null | undefined): string {
  const raw = galleryJson?.trim() ?? "";
  if (!raw) return "";
  try {
    const g = JSON.parse(raw) as unknown;
    if (!Array.isArray(g)) return "";
    for (const x of g) {
      if (typeof x === "string" && x.trim()) return x.trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

type Props = {
  equipo: EquipoASIC;
  canEdit: boolean;
  onDetail: (e: EquipoASIC) => void;
  onEdit: (e: EquipoASIC) => void;
  onDelete: (e: EquipoASIC) => void;
};

/**
 * Tarjeta visual estilo vitrina para el listado de gestión (/asic/equipment).
 * En SGI se prioriza la foto con logo Hashrate (galería); si solo hay tarjeta de tienda, se superpone el logo.
 */
export function EquipoAsicDashboardCard({ equipo: e, canEdit, onDetail, onEdit, onDelete }: Props) {
  const explicit = e.marketplaceImageSrc?.trim() ?? "";
  const inventoryBrand = firstGalleryImageSrc(e.marketplaceGalleryJson);
  const fallbackPath = defaultAsicShelfImageSrc(e.marcaEquipo ?? "", e.modelo ?? "");
  /** En SGI preferimos la foto con logo Hashrate (galería); la tarjeta sin logo es solo tienda. */
  const preferred = inventoryBrand || explicit || fallbackPath;
  const [imgSrc, setImgSrc] = useState(() => publicImageUrl(preferred));
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    const ex = e.marketplaceImageSrc?.trim() ?? "";
    const brand = firstGalleryImageSrc(e.marketplaceGalleryJson);
    const fb = defaultAsicShelfImageSrc(e.marcaEquipo ?? "", e.modelo ?? "");
    setImgSrc(publicImageUrl(brand || ex || fb));
    setImgBroken(false);
  }, [e.id, e.marketplaceImageSrc, e.marketplaceGalleryJson, e.marcaEquipo, e.modelo]);

  const src = imgSrc;
  const hasPhoto = Boolean(preferred.trim()) && !imgBroken;
  const brandUrl = inventoryBrand ? publicImageUrl(inventoryBrand) : "";
  /**
   * Si la tarjeta muestra la foto de tienda (sin watermark), superpone el logo Hashrate.
   * Si ya muestra la de galería (con logo), no duplicar.
   */
  const showHrsMark = hasPhoto && (!brandUrl || src !== brandUrl);
  const detailRows = parseDetailRowsJson(e.marketplaceDetailRowsJson ?? "")
    .filter((r) => r.text.trim())
    .slice(0, 4);
  const mpLabelRaw = e.marketplacePriceLabel?.trim() ?? "";
  const mpLabelDisplay = mpLabelRaw ? normalizeConsultPriceLabelForDisplay(mpLabelRaw) : "";
  const outOfStock = Boolean(mpLabelDisplay) && isMarketplaceOutOfStockLabel(mpLabelDisplay) && (e.precioUSD ?? 0) <= 0;

  return (
    <article className="shelf-product hrs-asic-dash-card" data-equipo-id={e.id}>
      <div className="shelf-product__media">
        <div className="shelf-product__media-gradient">
          <button
            type="button"
            className="shelf-product__imglink"
            aria-label={`Ver ficha — ${e.marcaEquipo} ${e.modelo}`}
            onClick={() => onDetail(e)}
          >
            {!hasPhoto || imgBroken ? (
              <div className="shelf-product__photo shelf-product__photo--fallback" aria-hidden />
            ) : (
              <img
                src={src}
                alt=""
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                className="shelf-product__photo"
                onError={() => {
                  const brand = firstGalleryImageSrc(e.marketplaceGalleryJson);
                  const ex = e.marketplaceImageSrc?.trim() ?? "";
                  if (brand && imgSrc === publicImageUrl(brand) && ex) {
                    setImgSrc(publicImageUrl(ex));
                    return;
                  }
                  if (ex && fallbackPath && imgSrc === publicImageUrl(ex)) {
                    setImgSrc(publicImageUrl(fallbackPath));
                    return;
                  }
                  setImgBroken(true);
                }}
              />
            )}
            {showHrsMark ? (
              <img
                className="hrs-asic-dash-card__hrs-mark"
                src={HASHRATE_SPACE_MARK}
                alt=""
                aria-hidden
                decoding="async"
              />
            ) : null}
          </button>
        </div>
      </div>
      <div className="shelf-product__body hrs-asic-dash-card__body">
        <div className="shelf-product__identity">
          <p className="shelf-product__brand">{(e.marcaEquipo ?? "").toUpperCase()}</p>
          <h3 className="shelf-product__title">{e.modelo}</h3>
          <p className="shelf-product__hashrate">{e.procesador}</p>
        </div>
        <div className="shelf-product__price-box">
          <span
            className={
              "shelf-product__price-value" +
              (outOfStock
                ? " shelf-product__price-value--oos"
                : mpLabelDisplay
                  ? " shelf-product__price-value--consult"
                  : "")
            }
          >
            {mpLabelDisplay || formatAsicPriceUsd(e.precioUSD ?? 0)}
          </span>
        </div>

        {detailRows.length > 0 ? (
          <div className="shelf-product__specs-box" role="group" aria-label="Especificaciones">
            <ul className="shelf-detail-strip">
              {detailRows.map((row, i) => (
                <li key={i} className="shelf-detail-strip__row">
                  <AsicDetailSvg kind={row.icon} />
                  <span className="shelf-detail-strip__txt">{row.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="hrs-asic-dash-card__meta text-muted small">
          <div>
            <strong className="text-dark">Código:</strong> {e.numeroSerie ?? "—"}
          </div>
          <div className="mt-1">
            <strong className="text-dark">Ingreso:</strong> {formatFechaCorta(e.fechaIngreso)}
          </div>
        </div>

        <button type="button" className="shelf-product__cta" onClick={() => onDetail(e)}>
          Ver ficha
        </button>

        {canEdit ? (
          <div className="hrs-asic-dash-card__actions d-flex flex-wrap gap-1 justify-content-center">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm flex-grow-1"
              style={{ minWidth: "4.5rem", fontSize: "0.78rem" }}
              onClick={() => onEdit(e)}
            >
              Editar
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              style={{ fontSize: "0.78rem" }}
              title="Eliminar equipo"
              onClick={() => onDelete(e)}
            >
              🗑️
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatFechaCorta(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
