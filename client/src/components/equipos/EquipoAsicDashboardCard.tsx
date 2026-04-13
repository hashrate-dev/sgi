import { useState } from "react";
import type { EquipoASIC } from "../../lib/types";
import { formatAsicPriceUsd, normalizeConsultPriceLabelForDisplay } from "../../lib/marketplaceAsicCatalog";
import { AsicDetailSvg } from "../marketplace/AsicDetailIcon";
import { parseDetailRowsJson } from "./MarketplaceDetailRowsEditor";

type Props = {
  equipo: EquipoASIC;
  canEdit: boolean;
  onDetail: (e: EquipoASIC) => void;
  onEdit: (e: EquipoASIC) => void;
  onDelete: (e: EquipoASIC) => void;
};

/**
 * Tarjeta visual estilo vitrina para el listado de gestión (/marketplacedashboard).
 */
export function EquipoAsicDashboardCard({ equipo: e, canEdit, onDetail, onEdit, onDelete }: Props) {
  const [imgBroken, setImgBroken] = useState(false);
  const src = e.marketplaceImageSrc?.trim() ?? "";
  const hasPhoto = Boolean(src);
  const detailRows = parseDetailRowsJson(e.marketplaceDetailRowsJson ?? "")
    .filter((r) => r.text.trim())
    .slice(0, 4);
  const mpLabelRaw = e.marketplacePriceLabel?.trim() ?? "";
  const mpLabelDisplay = mpLabelRaw ? normalizeConsultPriceLabelForDisplay(mpLabelRaw) : "";

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
                onError={() => setImgBroken(true)}
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
              "shelf-product__price-value" + (mpLabelDisplay ? " shelf-product__price-value--consult" : "")
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
