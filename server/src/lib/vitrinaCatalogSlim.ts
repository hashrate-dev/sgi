/**
 * Respuesta liviana de GET /marketplace/asic-vitrina (grilla /equipment).
 * Sin galería ni data URLs en JSON — el detalle completo va en GET /marketplace/asic-vitrina/:id.
 */

import {
  mapEquipoRowToVitrina,
  type EquipoAsicVitrinaRow,
  type VitrinaAsicProduct,
} from "./asicVitrinaMapper.js";
import { normalizeMarketplaceImageSrc } from "./marketplaceImageSrc.js";

/** En listado nunca enviamos base64 (multiplica el JSON y ralentiza parse + render). */
export function vitrinaListImageSrc(raw: string | null | undefined): string {
  const n = normalizeMarketplaceImageSrc(raw ?? "");
  if (!n || /^data:/i.test(n)) return "";
  if (n.length > 2048) return "";
  return n;
}

/** Catálogo grilla: sin galería, sin partes hashrate, imagen solo por URL. */
export function mapEquipoRowToVitrinaList(row: EquipoAsicVitrinaRow): VitrinaAsicProduct | null {
  const full = mapEquipoRowToVitrina(row);
  if (!full) return null;
  const imageSrc = vitrinaListImageSrc(row.mp_image_src);
  return {
    id: full.id,
    algo: full.algo,
    brand: full.brand,
    model: full.model,
    hashrate: full.hashrate,
    priceUsd: full.priceUsd,
    ...(full.priceDisplayLabel ? { priceDisplayLabel: full.priceDisplayLabel } : {}),
    imageSrc,
    detailRows: full.detailRows,
    estimatedYield: full.estimatedYield,
    listingKind: full.listingKind,
  };
}
