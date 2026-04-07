/**
 * Arma un `AsicProduct` para reutilizar el modal de vitrina (VER MÁS) en la gestión de equipos.
 */

import type { AsicAlgo, AsicProduct } from "./marketplaceAsicCatalog.js";
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
  const imageSrc = e.marketplaceImageSrc?.trim() ?? "";
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
  return {
    id: e.id,
    algo,
    brand: e.marcaEquipo,
    model: e.modelo,
    hashrate: e.procesador,
    priceUsd: e.precioUSD ?? 0,
    imageSrc,
    gallerySrcs: gallerySrcs?.length ? gallerySrcs : undefined,
    detailRows,
    estimatedYield: {
      line1: "Consultar rendimiento",
      line2: "—",
    },
  };
}
