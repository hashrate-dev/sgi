import { useEffect, useState } from "react";
import type { EquipoASIC } from "../../lib/types";
import {
  defaultAsicShelfImageSrc,
  formatAsicPriceUsd,
  isMarketplaceOutOfStockLabel,
  normalizeConsultPriceLabelForDisplay,
  publicImageUrl,
} from "../../lib/marketplaceAsicCatalog";
import { AsicDetailSvg } from "../marketplace/AsicDetailIcon";
import { parseDetailRowsJson } from "./MarketplaceDetailRowsEditor";

/** Primera foto de inventario (galería): la que el admin sube con logo Hashrate ya en la imagen. */
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
 * Tarjeta del listado SGI (/asic/equipment).
 * Usa la 1ª foto de inventario (galería, con logo ya en el archivo). Sin overlay artificial.
 */
export function EquipoAsicDashboardCard({ equipo: e, canEdit, onDetail, onEdit, onDelete }: Props) {
  const explicit = e.marketplaceImageSrc?.trim() ?? "";
  const inventoryFirst = firstGalleryImageSrc(e.marketplaceGalleryJson);
  const fallbackPath = defaultAsicShelfImageSrc(e.marcaEquipo ?? "", e.modelo ?? "");
  const preferred = inventoryFirst || explicit || fallbackPath;
  const [imgSrc, setImgSrc] = useState(() => publicImageUrl(preferred));
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    const ex = e.marketplaceImageSrc?.trim() ?? "";
    const inv = firstGalleryImageSrc(e.marketplaceGalleryJson);
    const fb = defaultAsicShelfImageSrc(e.marcaEquipo ?? "", e.modelo ?? "");
    setImgSrc(publicImageUrl(inv || ex || fb));
    setImgBroken(false);
  }, [e.id, e.marketplaceImageSrc, e.marketplaceGalleryJson, e.marcaEquipo, e.modelo]);

  const src = imgSrc;
  const hasPhoto = Boolean(preferred.trim()) && !imgBroken;
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
                  const inv = firstGalleryImageSrc(e.marketplaceGalleryJson);
                  const ex = e.marketplaceImageSrc?.trim() ?? "";
                  if (inv && imgSrc === publicImageUrl(inv) && ex) {
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

        {canEdit ? (
          <div className="hrs-asic-dash-card__actions d-flex flex-wrap gap-1 justify-content-center">
            <button type="button" className="btn btn-sm btn-success" onClick={() => onDetail(e)}>
              Ver ficha
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onEdit(e)}>
              Editar
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger"
              title="Eliminar"
              aria-label="Eliminar"
              onClick={() => onDelete(e)}
            >
              <i className="bi bi-trash" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="hrs-asic-dash-card__actions d-flex justify-content-center">
            <button type="button" className="btn btn-sm btn-success" onClick={() => onDetail(e)}>
              Ver ficha
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function formatFechaCorta(iso: string | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}
