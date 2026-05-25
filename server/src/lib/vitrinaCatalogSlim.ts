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

function parseGalleryRawUrls(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const g = JSON.parse(json) as unknown;
    if (!Array.isArray(g)) return [];
    return g
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

/** Imagen de grilla: principal o primera URL de galería que no sea data: (base64 va por `/shelf-image/:id`). */
export function pickVitrinaListImageSrc(
  row: Pick<EquipoAsicVitrinaRow, "mp_image_src" | "mp_gallery_json">
): string {
  const main = vitrinaListImageSrc(row.mp_image_src);
  if (main) return main;
  for (const raw of parseGalleryRawUrls(row.mp_gallery_json)) {
    const u = vitrinaListImageSrc(raw);
    if (u) return u;
  }
  return "";
}

/** Catálogo grilla: sin galería, sin partes hashrate, imagen solo por URL. */
export function mapEquipoRowToVitrinaList(row: EquipoAsicVitrinaRow): VitrinaAsicProduct | null {
  const full = mapEquipoRowToVitrina(row);
  if (!full) return null;
  const imageSrc = pickVitrinaListImageSrc(row);
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
