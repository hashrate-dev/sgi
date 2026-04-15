/**
 * Arma un `AsicProduct` para reutilizar el modal de vitrina (VER MÁS) en la gestión de equipos.
 */

import {
  type AsicAlgo,
  type AsicProduct,
  defaultAsicShelfImageSrc,
  normalizeConsultPriceLabelForDisplay,
  resolveMarketplaceListingKind,
} from "./marketplaceAsicCatalog.js";
import type { EquipoASIC } from "./types.js";
import { parseDetailRowsJson } from "../components/equipos/MarketplaceDetailRowsEditor";

function defaultDetailRows(algo: AsicAlgo): AsicProduct["detailRows"] {
  if (algo === "sha256") {
    return [
      { icon: "bolt", text: "—" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ];
  }
  return [
    { icon: "bolt", text: "—" },
    { icon: "chip", text: "DOGE + LTC · Scrypt" },
    { icon: "fan", text: "Minero de Aire" },
    { icon: "dual", text: "Minería Dual" },
  ];
}

export function equipoASICToModalProduct(e: EquipoASIC): AsicProduct {
  const algo: AsicAlgo = e.marketplaceAlgo === "scrypt" ? "scrypt" : "sha256";
  const parsed = parseDetailRowsJson(e.marketplaceDetailRowsJson ?? "").filter((r) => r.text.trim());
  const detailRows = parsed.length > 0 ? parsed : defaultDetailRows(algo);
  const explicitImg = e.marketplaceImageSrc?.trim() ?? "";
  const imageSrc = explicitImg || defaultAsicShelfImageSrc(e.marcaEquipo ?? "", e.modelo ?? "");
  let gallerySrcs: string[] | undefined;
  if (e.marketplaceGalleryJson?.trim()) {
    try {
      const g = JSON.parse(e.marketplaceGalleryJson) as unknown;
      if (Array.isArray(g) && g.every((x) => typeof x === "string" && String(x).trim())) {
        gallerySrcs = (g as string[]).map((x) => x.trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  const priceLabel = e.marketplacePriceLabel?.trim();
  const priceDisplayLabelNorm = priceLabel ? normalizeConsultPriceLabelForDisplay(priceLabel) : "";
  const listingKindRaw =
    e.marketplaceListingKind === "miner" || e.marketplaceListingKind === "infrastructure"
      ? e.marketplaceListingKind
      : undefined;
  const listingKind = resolveMarketplaceListingKind({
    brand: e.marcaEquipo,
    model: e.modelo,
    listingKind: listingKindRaw,
  });
  return {
    id: e.id,
    algo,
    brand: e.marcaEquipo,
    model: e.modelo,
    hashrate: e.procesador,
    priceUsd: e.precioUSD ?? 0,
    ...(priceDisplayLabelNorm ? { priceDisplayLabel: priceDisplayLabelNorm } : {}),
    imageSrc,
    gallerySrcs: gallerySrcs?.length ? gallerySrcs : undefined,
    detailRows,
    estimatedYield: {
      line1: "Consultar rendimiento",
      line2: "—",
    },
    listingKind,
  };
}
