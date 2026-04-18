/**
 * Carrito de cotización (marketplace: cliente o admin A/B). Persistencia local; sync opcional vía API.
 */

import type { AsicProduct } from "./marketplaceAsicCatalog.js";
import {
  formatAsicPriceUsd,
  normalizeConsultPriceLabelForDisplay,
  productHashrateShareParts,
  proratedEquipmentPriceUsd,
} from "./marketplaceAsicCatalog.js";
import {
  DEFAULT_QUOTE_WARRANTY_USD,
  resolveWarrantyUsdForQuoteLine,
  type GarantiaQuotePriceItem,
} from "./marketplaceGarantiaQuote.js";

export type { GarantiaQuotePriceItem };

export const QUOTE_CART_STORAGE_KEY = "hrs_marketplace_quote_cart_v1";
/** Carrito cuando aún no hay sesión cliente (no se sincroniza con el servidor). */
export const QUOTE_CART_GUEST_KEY = `${QUOTE_CART_STORAGE_KEY}_guest`;

export function quoteCartStorageKeyForUser(userId: number): string {
  return `${QUOTE_CART_STORAGE_KEY}_u${userId}`;
}

/** Estado en BD (lowercase). */
export function normalizeMarketplaceQuoteTicketStatus(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Orden en embudo comercial (bloquea otra orden activa hasta instalación / cierre / baja).
 * Alineado con servidor: pendiente → contacto → gestión → pagada → en viaje (no incluye `instalado`).
 */
export function isMarketplacePipelineTicketStatus(s: string): boolean {
  const x = normalizeMarketplaceQuoteTicketStatus(s);
  if (x === "respondido") return true;
  return (
    x === "pendiente" ||
    x === "orden_lista" ||
    x === "enviado_consulta" ||
    x === "en_contacto_equipo" ||
    x === "en_gestion" ||
    x === "pagada" ||
    x === "en_viaje"
  );
}
export const QUOTE_EMAIL = "dl@hashrate.space";
export const QUOTE_WA_PHONE = "595994392728";

/** Opcionales por unidad de equipo (instalación en granja / garantía). */
/** Fallback si no se puede leer S02/S03 desde la API. */
export const QUOTE_ADDON_SETUP_USD_FALLBACK = 50;
/** @deprecated Usar precios desde GET /api/marketplace/setup-quote-prices (S02 + S03). */
export const QUOTE_ADDON_SETUP_USD = QUOTE_ADDON_SETUP_USD_FALLBACK;
/** Fallback si no hay match en `items_garantia_ande` (GET /api/marketplace/garantia-quote-prices). */
export const QUOTE_ADDON_WARRANTY_USD = DEFAULT_QUOTE_WARRANTY_USD;

/** Precios setup desde gestión Setup: S02 = equipo completo, S03 = fracción hashrate. */
export type QuoteCartPricing = {
  setupEquipoCompletoUsd?: number;
  setupCompraHashrateUsd?: number;
  /** Precios garantía ANDE (`/equipos-asic/items-garantia`); match por código o marca+modelo. */
  garantiaItems?: GarantiaQuotePriceItem[];
};

function roundSetupUsd(n: unknown, fallback: number): number {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.round(n);
  return fallback;
}

/** Precio setup por unidad según la línea (100% → S02; 25/50/75 → S03). */
export function quoteCartSetupUnitUsd(l: QuoteCartLine, pricing?: QuoteCartPricing): number {
  const pct = lineHashrateSharePct(l);
  const setupPerPart = Number(l.hashrateSetupUsd);
  if (Number.isFinite(setupPerPart) && setupPerPart >= 0) return Math.round(setupPerPart);
  const full = roundSetupUsd(pricing?.setupEquipoCompletoUsd, QUOTE_ADDON_SETUP_USD_FALLBACK);
  const share = roundSetupUsd(pricing?.setupCompraHashrateUsd, QUOTE_ADDON_SETUP_USD_FALLBACK);
  return pct < 100 ? share : full;
}

export type QuoteCartLine = {
  productId: string;
  qty: number;
  brand: string;
  model: string;
  hashrate: string;
  priceUsd: number;
  /** Precio formateado al momento de agregar (evita inconsistencias si cambia el catálogo). */
  priceLabel: string;
  /** Fracción de hashrate de 1 equipo (omitido = equipo completo). */
  hashrateSharePct?: number;
  /** % de garantía aplicado para la parte (sobre garantía total del equipo). */
  hashrateWarrantyPct?: number;
  /** Setup USD por parte configurado para este equipo (si aplica). */
  hashrateSetupUsd?: number;
  /** Setup / instalación en granja (S02 equipo completo, S03 fracción hashrate). */
  includeSetup: boolean;
  /** Garantía ANDE (precio por ítem en gestión o fallback). */
  includeWarranty: boolean;
};

export function quoteCartWarrantyUnitUsd(l: QuoteCartLine, pricing?: QuoteCartPricing): number {
  return resolveWarrantyUsdForQuoteLine(
    { productId: l.productId, brand: l.brand, model: l.model, hashrate: l.hashrate },
    pricing?.garantiaItems
  );
}

/** Misma regla que la vitrina «SOLICITA PRECIO»: sin USD numérico en etiqueta → precio a cotizar. */
export function quoteLineEquipmentPricePendingFromFields(priceUsd: number, priceLabel: string): boolean {
  if (priceUsd > 0) return false;
  const base = priceLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (/^[\d.,\s]+\s*USD$/i.test(base)) return false;
  return true;
}

/**
 * Línea agregada sin precio USD de equipo (p. ej. vitrina «SOLICITA PRECIO»).
 * Setup y garantía tampoco se tratan como importe fijo: los cotiza el equipo comercial.
 */
export function quoteCartLineIsEquipmentPricePending(l: QuoteCartLine): boolean {
  return quoteLineEquipmentPricePendingFromFields(l.priceUsd, l.priceLabel);
}

/** Ítem persistido en ticket (JSON) — misma lógica que `quoteCartLineIsEquipmentPricePending`. */
export function ticketRowIsEquipmentPricePending(row: Record<string, unknown>): boolean {
  const priceUsd = Math.max(0, Math.round(Number(row.priceUsd) || 0));
  const pl = row.priceLabel;
  const priceLabel = typeof pl === "string" ? pl : formatAsicPriceUsd(priceUsd);
  return quoteLineEquipmentPricePendingFromFields(priceUsd, priceLabel);
}

export function quoteCartHasEquipmentPricePending(lines: QuoteCartLine[]): boolean {
  return lines.some(quoteCartLineIsEquipmentPricePending);
}

/** Hay al menos un ítem con precio publicado y otro «Solicita precio» (cotización pendiente). */
export function quoteCartHasMixedPricedAndConsultLines(lines: QuoteCartLine[]): boolean {
  if (lines.length < 2) return false;
  let hasPending = false;
  let hasPriced = false;
  for (const l of lines) {
    if (quoteCartLineIsEquipmentPricePending(l)) hasPending = true;
    else hasPriced = true;
  }
  return hasPending && hasPriced;
}

const MAX_QTY = 99;

/** Clave única por producto + fracción de hashrate (misma máquina 100% y 25% = dos líneas). */
export function quoteCartLineKey(l: Pick<QuoteCartLine, "productId" | "hashrateSharePct">): string {
  const n = Math.round(Number(l.hashrateSharePct));
  const shareKey = Number.isFinite(n) && n >= 1 && n <= 100 ? String(n) : "full";
  return `${l.productId}:${shareKey}`;
}

export function lineHashrateSharePct(l: QuoteCartLine): number {
  const n = Math.round(Number(l.hashrateSharePct));
  if (Number.isFinite(n) && n >= 1 && n <= 100) return n;
  return 100;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function parseLine(x: unknown): QuoteCartLine | null {
  if (!isRecord(x)) return null;
  const rawId = x.productId;
  const productId =
    typeof rawId === "string" ? rawId.trim() : String(rawId ?? "").trim();
  const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(x.qty) || 0)));
  const brand = typeof x.brand === "string" ? x.brand : "";
  const model = typeof x.model === "string" ? x.model : "";
  const hashrate = typeof x.hashrate === "string" ? x.hashrate : "";
  const priceUsd = Math.max(0, Math.round(Number(x.priceUsd) || 0));
  const priceLabel = typeof x.priceLabel === "string" ? x.priceLabel : formatAsicPriceUsd(priceUsd);
  /* Sin clave en JSON histórico = sin add-ons (no cambiar totales de carritos viejos). */
  const includeSetup = x.includeSetup === true;
  const includeWarranty = x.includeWarranty === true;
  const rawShare = Number(x.hashrateSharePct);
  const hashrateSharePct = Number.isFinite(rawShare) && rawShare >= 1 && rawShare <= 100 ? Math.round(rawShare) : undefined;
  const rawWarrantyPct = Number(x.hashrateWarrantyPct);
  const hashrateWarrantyPct =
    Number.isFinite(rawWarrantyPct) && rawWarrantyPct >= 0 && rawWarrantyPct <= 100
      ? Math.round(rawWarrantyPct)
      : undefined;
  const rawSetupUsd = Number(x.hashrateSetupUsd);
  const hashrateSetupUsd = Number.isFinite(rawSetupUsd) && rawSetupUsd >= 0 ? Math.round(rawSetupUsd) : undefined;
  if (!productId) return null;
  return {
    productId,
    qty,
    brand,
    model,
    hashrate,
    priceUsd,
    priceLabel,
    ...(hashrateSharePct != null ? { hashrateSharePct } : {}),
    ...(hashrateWarrantyPct != null ? { hashrateWarrantyPct } : {}),
    ...(hashrateSetupUsd != null ? { hashrateSetupUsd } : {}),
    includeSetup,
    includeWarranty,
  };
}

export type MarketplaceQuoteLineDisplayOpts = {
  /** Si es false, no agrega "(25% hashrate)" (p. ej. el carrito ya muestra esa línea aparte). Default true. */
  includeShareSuffix?: boolean;
};

/** Marca+modelo en una línea; hashrate (y % si aplica) en otra — evita cortar "235" y "TH/s". */
export type MarketplaceQuoteLineTitleParts = {
  brandModel: string;
  specLine: string | null;
};

/**
 * Partes del título de línea: arriba marca y modelo; abajo hashrate (p. ej. `235 TH/s`) junto con `white-space: nowrap` en UI.
 */
export function marketplaceQuoteTicketLineDisplayParts(
  row: Record<string, unknown>,
  opts?: MarketplaceQuoteLineDisplayOpts
): MarketplaceQuoteLineTitleParts {
  const includeShare = opts?.includeShareSuffix !== false;
  const brand = String(row.brand ?? "").trim();
  const model = String(row.model ?? "").trim();
  const productId = String(row.productId ?? "").trim();
  const brandModel = [brand, model].filter(Boolean).join(" ").trim() || productId || "—";
  const hr = String(row.hashrate ?? "").trim();
  const rawShare = Math.round(Number(row.hashrateSharePct));
  const sharePct = Number.isFinite(rawShare) && rawShare >= 1 && rawShare < 100 ? rawShare : null;

  let specLine: string | null = null;
  if (hr) specLine = hr;
  if (includeShare && sharePct != null) {
    const tail = `(${sharePct}% hashrate)`;
    specLine = specLine ? `${specLine} ${tail}` : tail;
  }
  return { brandModel, specLine };
}

/**
 * Nombre en una sola cadena (listados, búsquedas): marca + modelo · hashrate (+ % si aplica).
 */
export function marketplaceQuoteTicketLineDisplayName(
  row: Record<string, unknown>,
  opts?: MarketplaceQuoteLineDisplayOpts
): string {
  const { brandModel, specLine } = marketplaceQuoteTicketLineDisplayParts(row, opts);
  if (!specLine) return brandModel;
  const hasHr = String(row.hashrate ?? "").trim().length > 0;
  /** Con hashrate se usa « · » como antes; solo fracción: espacio antes del paréntesis (sin punto medio). */
  const joiner = hasHr ? " · " : " ";
  return `${brandModel}${joiner}${specLine}`;
}

/** Líneas devueltas por POST /quote-sync (fusión con orden en curso) u items del ticket. */
export function quoteCartLinesFromApiPayload(rows: unknown): QuoteCartLine[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(parseLine).filter((l): l is QuoteCartLine => l != null);
}

/**
 * Alineado con el servidor al hidratar con orden en pipeline: el carrito local es el snapshot si ya tiene líneas;
 * si está vacío (primer paint), se muestran las del ticket.
 * Evita que líneas quitadas en el carrito “vuelvan” al unir con el servidor.
 */
export function mergeCartLinesForPipelineOrder(baseFromServer: QuoteCartLine[], incomingLocal: QuoteCartLine[]): QuoteCartLine[] {
  const sortFn = (a: QuoteCartLine, b: QuoteCartLine) => quoteCartLineKey(a).localeCompare(quoteCartLineKey(b));
  if (incomingLocal.length > 0) {
    return [...incomingLocal].sort(sortFn);
  }
  return [...baseFromServer].sort(sortFn);
}

export function readQuoteCartFromStorageKey(storageKey: string): QuoteCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = window.localStorage.getItem(storageKey);
    if (!raw && storageKey === QUOTE_CART_GUEST_KEY) {
      raw = window.localStorage.getItem(QUOTE_CART_STORAGE_KEY);
    }
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.map(parseLine).filter((l): l is QuoteCartLine => l != null);
  } catch {
    return [];
  }
}

export function writeQuoteCartToStorageKey(storageKey: string, lines: QuoteCartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(lines));
  } catch {
    /* quota / private mode */
  }
}

/** @deprecated Usar readQuoteCartFromStorageKey con la clave por usuario o invitado */
export function readQuoteCartFromStorage(): QuoteCartLine[] {
  return readQuoteCartFromStorageKey(QUOTE_CART_STORAGE_KEY);
}

/** @deprecated Usar writeQuoteCartToStorageKey */
export function writeQuoteCartToStorage(lines: QuoteCartLine[]): void {
  writeQuoteCartToStorageKey(QUOTE_CART_STORAGE_KEY, lines);
}

export type AddQuoteLineOptions = {
  /** Fracción de hashrate (omitir = equipo completo). */
  hashrateSharePct?: number;
};

function equipmentPriceLabelForLine(product: AsicProduct, sharePct: number): string {
  if (product.priceDisplayLabel?.trim()) {
    const base = normalizeConsultPriceLabelForDisplay(product.priceDisplayLabel.trim());
    if (base) return sharePct < 100 ? `${base} (${sharePct}%)` : base;
  }
  const usd = proratedEquipmentPriceUsd(product, sharePct);
  const base = formatAsicPriceUsd(usd);
  return sharePct < 100 ? `${base} (${sharePct}%)` : base;
}

export function productToQuoteLine(product: AsicProduct, qty: number, opts?: AddQuoteLineOptions): QuoteCartLine {
  const q = Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1));
  const hasShare = opts?.hashrateSharePct != null;
  const share = Math.round(Number(opts?.hashrateSharePct));
  const pct = Number.isFinite(share) && share >= 1 && share <= 100 ? share : 100;
  const sharePart = hasShare ? productHashrateShareParts(product).find((x) => x.sharePct === pct) : undefined;
  const priceUsd = proratedEquipmentPriceUsd(product, pct);
  const line: QuoteCartLine = {
    productId: product.id,
    qty: q,
    brand: product.brand,
    model: product.model,
    hashrate: product.hashrate,
    priceUsd,
    priceLabel: equipmentPriceLabelForLine(product, pct),
    includeSetup: true,
    includeWarranty: true,
  };
  if (hasShare) {
    line.hashrateSharePct = pct;
    if (sharePart) {
      line.hashrateWarrantyPct = pct;
      line.hashrateSetupUsd = sharePart.setupUsd;
    }
  }
  return line;
}

export function mergeAddLine(
  prev: QuoteCartLine[],
  product: AsicProduct,
  addQty: number,
  opts?: AddQuoteLineOptions
): QuoteCartLine[] {
  const q = Math.min(MAX_QTY, Math.max(1, Math.round(addQty) || 1));
  const hasShare = opts?.hashrateSharePct != null;
  const share = Math.round(Number(opts?.hashrateSharePct));
  const pct = Number.isFinite(share) && share >= 1 && share <= 100 ? share : 100;
  const key = quoteCartLineKey({ productId: product.id, hashrateSharePct: hasShare ? pct : undefined });
  const idx = prev.findIndex((l) => quoteCartLineKey(l) === key);
  if (idx < 0) {
    const addOpts: AddQuoteLineOptions | undefined =
      hasShare ? { hashrateSharePct: pct } : undefined;
    return [...prev, productToQuoteLine(product, q, addOpts)];
  }
  const next = [...prev];
  const merged = Math.min(MAX_QTY, next[idx].qty + q);
  const priceUsd = proratedEquipmentPriceUsd(product, pct);
  const cur = next[idx];
  const base: QuoteCartLine = {
    ...cur,
    qty: merged,
    priceUsd,
    priceLabel: equipmentPriceLabelForLine(product, pct),
    brand: product.brand,
    model: product.model,
    hashrate: product.hashrate,
    includeSetup: cur.includeSetup,
    includeWarranty: cur.includeWarranty,
  };
  if (hasShare) {
    const sharePart = productHashrateShareParts(product).find((x) => x.sharePct === pct);
    base.hashrateSharePct = pct;
    if (sharePart) {
      base.hashrateWarrantyPct = pct;
      base.hashrateSetupUsd = sharePart.setupUsd;
    }
  } else {
    delete base.hashrateSharePct;
    delete base.hashrateWarrantyPct;
    delete base.hashrateSetupUsd;
  }
  next[idx] = base;
  return next;
}

export function quoteCartTotalUnits(lines: QuoteCartLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}

/** Subtotal solo equipo (sin add-ons). */
export function quoteCartLineEquipmentSubtotalUsd(l: QuoteCartLine): number {
  return l.qty * l.priceUsd;
}

/** Multiplicador por fracción de hashrate (solo garantía proporcional al %; setup fijo). */
function shareAddonMult(l: QuoteCartLine): number {
  return lineHashrateSharePct(l) / 100;
}

/**
 * Setup en granja: S02 si equipo completo, S03 si fracción hashrate (gestión Setup).
 * La garantía sigue prorrateada al % cuando la línea es porción (25/50/75).
 */
export function quoteCartLineAddonsUsd(l: QuoteCartLine, pricing?: QuoteCartPricing): number {
  const pendingEquipmentPrice = quoteCartLineIsEquipmentPricePending(l);
  const setupUnit = quoteCartSetupUnitUsd(l, pricing);
  const m = shareAddonMult(l);
  let a = 0;
  // Con equipo "Solicita precio", setup se cotiza luego; garantía sí usa precio del sistema.
  if (l.includeSetup && !pendingEquipmentPrice) a += l.qty * setupUnit;
  if (l.includeWarranty) a += Math.round(l.qty * quoteCartWarrantyUnitUsd(l, pricing) * m);
  return a;
}

export function quoteCartLineSubtotalUsd(l: QuoteCartLine, pricing?: QuoteCartPricing): number {
  return quoteCartLineEquipmentSubtotalUsd(l) + quoteCartLineAddonsUsd(l, pricing);
}

export function quoteCartSubtotalUsd(lines: QuoteCartLine[], pricing?: QuoteCartPricing): number {
  return lines.reduce((s, l) => s + quoteCartLineSubtotalUsd(l, pricing), 0);
}

/** % hashrate desde ítem persistido en ticket (JSON). */
export function ticketRowSharePct(row: Record<string, unknown>): number {
  const raw = Math.round(Number(row.hashrateSharePct));
  if (Number.isFinite(raw) && raw >= 1 && raw <= 100) return raw;
  return 100;
}

function ticketRowSetupUsd(row: Record<string, unknown>): number | null {
  const raw = Math.round(Number(row.hashrateSetupUsd));
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return null;
}

/** Partes de precio de una línea persistida en ticket (equipo + add-ons); misma regla que el carrito. */
export type TicketRowLineBreakdown = {
  qty: number;
  priceUsd: number;
  priceLabel: string;
  pendingEquipmentPrice: boolean;
  sharePct: number;
  includeSetup: boolean;
  includeWarranty: boolean;
  /** USD/unidad de setup que usa el cálculo (S02/S03 o `hashrateSetupUsd` en la línea). */
  setupUnitUsd: number;
  equipmentSubtotalUsd: number;
  setupLineTotalUsd: number;
  /** Garantía referencial por equipo completo (100%), antes del % de hashrate. */
  warrantyCatalogUnitUsd: number;
  warrantyLineTotalUsd: number;
};

export function ticketRowLineBreakdown(row: Record<string, unknown>, pricing?: QuoteCartPricing): TicketRowLineBreakdown {
  const qty = Math.max(0, Math.round(Number(row.qty) || 0));
  const priceUsd = Math.max(0, Math.round(Number(row.priceUsd) || 0));
  const pl = row.priceLabel;
  const priceLabel = typeof pl === "string" ? pl : formatAsicPriceUsd(priceUsd);
  const pendingEquipmentPrice = quoteLineEquipmentPricePendingFromFields(priceUsd, priceLabel);
  const pct = ticketRowSharePct(row);
  const setupFromRow = ticketRowSetupUsd(row);
  const setupUnitUsd =
    setupFromRow != null
      ? setupFromRow
      : pct < 100
        ? roundSetupUsd(pricing?.setupCompraHashrateUsd, QUOTE_ADDON_SETUP_USD_FALLBACK)
        : roundSetupUsd(pricing?.setupEquipoCompletoUsd, QUOTE_ADDON_SETUP_USD_FALLBACK);
  const mWarranty = pct / 100;
  const includeSetup = row.includeSetup === true;
  const includeWarranty = row.includeWarranty === true;
  const warrantyCatalogUnitUsd = resolveWarrantyUsdForQuoteLine(
    {
      productId: String(row.productId ?? ""),
      brand: String(row.brand ?? ""),
      model: String(row.model ?? ""),
      hashrate: String(row.hashrate ?? ""),
    },
    pricing?.garantiaItems
  );
  const equipmentSubtotalUsd = qty * priceUsd;
  const setupLineTotalUsd = includeSetup && !pendingEquipmentPrice ? qty * setupUnitUsd : 0;
  const warrantyLineTotalUsd = includeWarranty ? Math.round(qty * warrantyCatalogUnitUsd * mWarranty) : 0;
  return {
    qty,
    priceUsd,
    priceLabel,
    pendingEquipmentPrice,
    sharePct: pct,
    includeSetup,
    includeWarranty,
    setupUnitUsd,
    equipmentSubtotalUsd,
    setupLineTotalUsd,
    warrantyCatalogUnitUsd,
    warrantyLineTotalUsd,
  };
}

/** Subtotal de una línea de ticket (misma lógica que carrito). */
export function ticketRowLineSubtotalUsd(row: Record<string, unknown>, pricing?: QuoteCartPricing): number {
  const b = ticketRowLineBreakdown(row, pricing);
  return b.equipmentSubtotalUsd + b.setupLineTotalUsd + b.warrantyLineTotalUsd;
}

/** Texto plano para WhatsApp / cuerpo de mail. */
/** Pie de mensaje con orden/ticket (tras sync con servidor). */
export function ticketRefFooter(orderNumber: string, ticketCode: string): string {
  return `\n\n—\nReferencia: Orden ${orderNumber} · Ticket ${ticketCode} (hashrate.space/marketplace)`;
}

export function buildQuoteMessage(
  lines: QuoteCartLine[],
  ref?: { orderNumber: string; ticketCode: string },
  pricing: QuoteCartPricing = {}
): string {
  if (lines.length === 0) {
    let t = "Hola, quisiera una cotización desde hashrate.space/marketplace.";
    if (ref) t += ticketRefFooter(ref.orderNumber, ref.ticketCode);
    return t;
  }
  const header =
    "Hola, solicito cotización por los siguientes equipos (tienda online hashrate.space /marketplace):\n\n";
  const body = lines
    .map((l, i) => {
      const pct = lineHashrateSharePct(l);
      const shareNote =
        pct < 100 ? ` — Fracción hashrate: ${pct}% de 1 equipo (misma máquina)` : "";
      const pending = quoteCartLineIsEquipmentPricePending(l);
      const eq = quoteCartLineEquipmentSubtotalUsd(l);
      const m = shareAddonMult(l);
      const addons: string[] = [];
      if (l.includeSetup) {
        if (pending) {
          addons.push(`Setup en granja: importe a cotizar con el equipo comercial de Hashrate (×${l.qty} u.)`);
        } else {
          const unit = quoteCartSetupUnitUsd(l, pricing);
          addons.push(
            `Setup en granja: ${unit.toLocaleString("es-PY")} USD × ${l.qty} u. = ${(l.qty * unit).toLocaleString("es-PY")} USD`
          );
        }
      }
      if (l.includeWarranty) {
        const unit = Math.round(quoteCartWarrantyUnitUsd(l, pricing) * m);
        addons.push(
          `Garantía: ${unit.toLocaleString("es-PY")} USD × ${l.qty} u. = ${(l.qty * unit).toLocaleString("es-PY")} USD`
        );
      }
      const addonBlock = addons.length ? `\n   ${addons.join("\n   ")}` : "";
      const sub = quoteCartLineSubtotalUsd(l, pricing);
      const subLine = pending
        ? "Subtotal línea: equipo/setup a cotizar + garantía desde tarifa del sistema"
        : `Subtotal línea: ${sub.toLocaleString("es-PY")} USD`;
      return (
        `${i + 1}) ${l.brand} ${l.model} — ${l.hashrate}${shareNote}\n` +
        `   Cantidad: ${l.qty} — Precio ref. unit.: ${l.priceLabel} — Equipo: ${eq.toLocaleString("es-PY")} USD` +
        addonBlock +
        `\n   ${subLine}`
      );
    })
    .join("\n\n");
  const total = quoteCartSubtotalUsd(lines, pricing);
  const anyPending = quoteCartHasEquipmentPricePending(lines);
  const footer =
    `\n\n—\n` +
    (anyPending
      ? "Líneas en consulta: precios de minero, setup y garantía serán confirmados por el equipo comercial de Hashrate al contactarte.\n"
      : "") +
    `Total referencial (USD): ${total.toLocaleString("es-PY")} — sujeto a confirmación, impuestos y disponibilidad.\n\nGracias.`;
  let out = header + body + footer;
  if (ref) out += ticketRefFooter(ref.orderNumber, ref.ticketCode);
  return out;
}

export function buildQuoteMailto(
  lines: QuoteCartLine[],
  ref?: { orderNumber: string; ticketCode: string },
  pricing: QuoteCartPricing = {}
): string {
  const sub = quoteCartSubtotalUsd(lines, pricing);
  const anyPending = quoteCartHasEquipmentPricePending(lines);
  const subjTail =
    lines.length === 0
      ? ""
      : anyPending && sub === 0
        ? `${lines.length} ítem(s) — precios a cotizar`
        : `${lines.length} ítem(s) — ref. ${sub.toLocaleString("es-PY")} USD`;
  const subject = encodeURIComponent(
    lines.length === 0 ? "Cotización marketplace ASIC" : `Cotización marketplace — ${subjTail}`
  );
  const body = encodeURIComponent(buildQuoteMessage(lines, ref, pricing));
  return `mailto:${QUOTE_EMAIL}?subject=${subject}&body=${body}`;
}

export function buildQuoteWhatsAppUrl(
  lines: QuoteCartLine[],
  ref?: { orderNumber: string; ticketCode: string },
  pricing: QuoteCartPricing = {}
): string {
  return `https://wa.me/${QUOTE_WA_PHONE}?text=${encodeURIComponent(buildQuoteMessage(lines, ref, pricing))}`;
}
