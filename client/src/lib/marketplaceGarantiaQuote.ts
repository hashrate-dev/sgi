/**
 * Empareja líneas del carrito marketplace con `items_garantia_ande` (gestión /equipos-asic/items-garantia).
 * Mantener la misma lógica que `server/src/lib/marketplaceGarantiaQuote.ts`.
 */

export type GarantiaQuotePriceItem = {
  codigo: string;
  marca: string;
  modelo: string;
  marketplaceEquipoId?: string | null;
  precioGarantia: number;
};

export const DEFAULT_QUOTE_WARRANTY_USD = 0;

function norm(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseHashrate(text: string): { value: number; unit: string } | null {
  const m = String(text ?? "")
    .toLowerCase()
    .match(/(\d+(?:[.,]\d+)?)\s*(th\/s|gh\/s|mh\/s|kh\/s|ph\/s|ths|ghs|mhs|khs|phs)\b/i);
  if (!m) return null;
  const value = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = String(m[2] ?? "").toLowerCase().replace("/", "");
  return { value, unit };
}

function extractModelKey(text: string): string {
  const stop = new Set([
    "antminer",
    "bitmain",
    "pro",
    "xp",
    "hydro",
    "series",
    "rack",
    "antrack",
    "antspace",
    "cap",
    "ths",
    "ghs",
    "mhs",
    "khs",
    "phs",
  ]);
  const tokens = norm(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const tk of tokens) {
    if (stop.has(tk)) continue;
    if (/[a-z]*\d+[a-z]*/i.test(tk)) return tk;
  }
  return "";
}

export function resolveWarrantyUsdForQuoteLine(
  line: { productId: string; brand: string; model: string; hashrate?: string },
  items: readonly GarantiaQuotePriceItem[] | undefined | null
): number {
  if (!items?.length) return DEFAULT_QUOTE_WARRANTY_USD;
  const pid = norm(line.productId);

  // Match explícito configurado en /equipos-asic/items-garantia.
  for (const it of items) {
    const p = Number(it.precioGarantia);
    if (!Number.isFinite(p) || p < 0) continue;
    const linkedId = norm(it.marketplaceEquipoId ?? "");
    if (linkedId && linkedId === pid) return Math.round(p);
  }

  for (const it of items) {
    const p = Number(it.precioGarantia);
    if (!Number.isFinite(p) || p < 0) continue;
    const c = norm(it.codigo);
    if (c && c !== "—" && c !== "-" && c === pid) return Math.round(p);
  }

  const bm = `${norm(line.brand)} ${norm(line.model)}`.trim();

  let exactZeroMatch = false;
  for (const it of items) {
    const p = Number(it.precioGarantia);
    if (!Number.isFinite(p) || p < 0) continue;
    const imm = `${norm(it.marca)} ${norm(it.modelo)}`.trim();
    if (!imm || imm !== bm) continue;
    if (p > 0) return Math.round(p);
    exactZeroMatch = true;
  }

  const bLine = norm(line.brand);

  /**
   * Fallback por hashrate para modelos genéricos (ej: "Antminer S21" + "235 TH/s"),
   * priorizando coincidencia de potencia/unidad con precio > 0 en items_garantia_ande.
   */
  const lineHr = parseHashrate(String(line.hashrate ?? ""));
  if (lineHr && bLine) {
    for (const it of items) {
      const p = Number(it.precioGarantia);
      if (!Number.isFinite(p) || p <= 0) continue;
      if (norm(it.marca) !== bLine) continue;
      const hrItem = parseHashrate(String(it.modelo ?? ""));
      if (!hrItem) continue;
      if (hrItem.unit === lineHr.unit && Math.abs(hrItem.value - lineHr.value) <= 0.001) {
        return Math.round(p);
      }
    }
  }

  /** Fallback estricto por clave de modelo (evita cruces erróneos tipo L9 -> 235). */
  const lineKey = extractModelKey(line.model);
  if (bLine && lineKey) {
    for (const it of items) {
      const p = Number(it.precioGarantia);
      if (!Number.isFinite(p) || p <= 0) continue;
      if (norm(it.marca) !== bLine) continue;
      const itemKey = extractModelKey(it.modelo);
      if (!itemKey || itemKey !== lineKey) continue;
      return Math.round(p);
    }
  }

  if (exactZeroMatch) return 0;
  return DEFAULT_QUOTE_WARRANTY_USD;
}
