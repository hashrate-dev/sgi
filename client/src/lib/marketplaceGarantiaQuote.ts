/**
 * Empareja líneas del carrito marketplace con `items_garantia_ande` (gestión /equipos-asic/items-garantia).
 * Mantener la misma lógica que `server/src/lib/marketplaceGarantiaQuote.ts`.
 */

export type GarantiaQuotePriceItem = {
  codigo: string;
  marca: string;
  modelo: string;
  precioGarantia: number;
};

export const DEFAULT_QUOTE_WARRANTY_USD = 200;

function norm(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveWarrantyUsdForQuoteLine(
  line: { productId: string; brand: string; model: string },
  items: readonly GarantiaQuotePriceItem[] | undefined | null
): number {
  if (!items?.length) return DEFAULT_QUOTE_WARRANTY_USD;
  const pid = norm(line.productId);

  for (const it of items) {
    const p = Number(it.precioGarantia);
    if (!Number.isFinite(p) || p < 0) continue;
    const c = norm(it.codigo);
    if (c && c !== "—" && c !== "-" && c === pid) return Math.round(p);
  }

  const bm = `${norm(line.brand)} ${norm(line.model)}`.trim();

  for (const it of items) {
    const p = Number(it.precioGarantia);
    if (!Number.isFinite(p) || p < 0) continue;
    const imm = `${norm(it.marca)} ${norm(it.modelo)}`.trim();
    if (imm && imm === bm) return Math.round(p);
  }

  return DEFAULT_QUOTE_WARRANTY_USD;
}
