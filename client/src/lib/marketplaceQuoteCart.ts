/**
 * Carrito de cotización (marketplace: cliente o admin A/B). Persistencia local; sync opcional vía API.
 */

import type { AsicProduct } from "./marketplaceAsicCatalog.js";
import { formatAsicPriceUsd, proratedEquipmentPriceUsd } from "./marketplaceAsicCatalog.js";

export const QUOTE_CART_STORAGE_KEY = "hrs_marketplace_quote_cart_v1";
/** Carrito cuando aún no hay sesión cliente (no se sincroniza con el servidor). */
export const QUOTE_CART_GUEST_KEY = `${QUOTE_CART_STORAGE_KEY}_guest`;

export function quoteCartStorageKeyForUser(userId: number): string {
  return `${QUOTE_CART_STORAGE_KEY}_u${userId}`;
}
export const QUOTE_EMAIL = "dl@hashrate.space";
export const QUOTE_WA_PHONE = "595994392728";

/** Opcionales por unidad de equipo (instalación en granja / garantía). */
/** Fallback si no se puede leer S02/S03 desde la API. */
export const QUOTE_ADDON_SETUP_USD_FALLBACK = 50;
/** @deprecated Usar precios desde GET /api/marketplace/setup-quote-prices (S02 + S03). */
export const QUOTE_ADDON_SETUP_USD = QUOTE_ADDON_SETUP_USD_FALLBACK;
export const QUOTE_ADDON_WARRANTY_USD = 200;

/** Precios setup desde gestión Setup: S02 = equipo completo, S03 = fracción hashrate. */
export type QuoteCartPricing = {
  setupEquipoCompletoUsd?: number;
  setupCompraHashrateUsd?: number;
};

function roundSetupUsd(n: unknown, fallback: number): number {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.round(n);
  return fallback;
}

/** Precio setup por unidad según la línea (100% → S02; 25/50/75 → S03). */
export function quoteCartSetupUnitUsd(l: QuoteCartLine, pricing?: QuoteCartPricing): number {
  const pct = lineHashrateSharePct(l);
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
  /** Fracción de hashrate de 1 equipo (omitido = equipo completo). Solo algunos modelos. */
  hashrateSharePct?: 25 | 50 | 75;
  /** Setup / instalación en granja (S02 equipo completo, S03 fracción hashrate). */
  includeSetup: boolean;
  /** Garantía (200 USD por unidad). */
  includeWarranty: boolean;
};

const MAX_QTY = 99;

/** Clave única por producto + fracción de hashrate (misma máquina 100% y 25% = dos líneas). */
export function quoteCartLineKey(l: Pick<QuoteCartLine, "productId" | "hashrateSharePct">): string {
  return `${l.productId}:${l.hashrateSharePct ?? 100}`;
}

export function lineHashrateSharePct(l: QuoteCartLine): number {
  const n = l.hashrateSharePct;
  if (n === 25 || n === 50 || n === 75) return n;
  return 100;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function parseLine(x: unknown): QuoteCartLine | null {
  if (!isRecord(x)) return null;
  const productId = typeof x.productId === "string" ? x.productId.trim() : "";
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
  const hashrateSharePct =
    rawShare === 25 || rawShare === 50 || rawShare === 75 ? rawShare : undefined;
  if (!productId || !model) return null;
  return {
    productId,
    qty,
    brand,
    model,
    hashrate,
    priceUsd,
    priceLabel,
    ...(hashrateSharePct != null ? { hashrateSharePct } : {}),
    includeSetup,
    includeWarranty,
  };
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
  hashrateSharePct?: 25 | 50 | 75;
};

function equipmentPriceLabelForLine(product: AsicProduct, sharePct: number): string {
  const usd = proratedEquipmentPriceUsd(product, sharePct);
  const base = formatAsicPriceUsd(usd);
  return sharePct < 100 ? `${base} (${sharePct}%)` : base;
}

export function productToQuoteLine(product: AsicProduct, qty: number, opts?: AddQuoteLineOptions): QuoteCartLine {
  const q = Math.min(MAX_QTY, Math.max(1, Math.round(qty) || 1));
  const share = opts?.hashrateSharePct;
  const pct = share === 25 || share === 50 || share === 75 ? share : 100;
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
  if (pct === 25 || pct === 50 || pct === 75) line.hashrateSharePct = pct;
  return line;
}

export function mergeAddLine(
  prev: QuoteCartLine[],
  product: AsicProduct,
  addQty: number,
  opts?: AddQuoteLineOptions
): QuoteCartLine[] {
  const q = Math.min(MAX_QTY, Math.max(1, Math.round(addQty) || 1));
  const share = opts?.hashrateSharePct;
  const pct = share === 25 || share === 50 || share === 75 ? share : 100;
  const idx = prev.findIndex((l) => l.productId === product.id && lineHashrateSharePct(l) === pct);
  if (idx < 0) {
    const addOpts: AddQuoteLineOptions | undefined =
      pct === 25 || pct === 50 || pct === 75 ? { hashrateSharePct: pct } : undefined;
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
  if (pct === 25 || pct === 50 || pct === 75) base.hashrateSharePct = pct;
  else delete base.hashrateSharePct;
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
  const setupUnit = quoteCartSetupUnitUsd(l, pricing);
  const m = shareAddonMult(l);
  let a = 0;
  if (l.includeSetup) a += l.qty * setupUnit;
  if (l.includeWarranty) a += Math.round(l.qty * QUOTE_ADDON_WARRANTY_USD * m);
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
  const raw = Number(row.hashrateSharePct);
  if (raw === 25 || raw === 50 || raw === 75) return raw;
  return 100;
}

/** Subtotal de una línea de ticket (misma lógica que carrito). */
export function ticketRowLineSubtotalUsd(row: Record<string, unknown>, pricing?: QuoteCartPricing): number {
  const qty = Number(row.qty) || 0;
  const pu = Number(row.priceUsd) || 0;
  const pct = ticketRowSharePct(row);
  const setupUnit =
    pct < 100
      ? roundSetupUsd(pricing?.setupCompraHashrateUsd, QUOTE_ADDON_SETUP_USD_FALLBACK)
      : roundSetupUsd(pricing?.setupEquipoCompletoUsd, QUOTE_ADDON_SETUP_USD_FALLBACK);
  const m = pct / 100;
  let sub = qty * pu;
  if (row.includeSetup === true) sub += qty * setupUnit;
  if (row.includeWarranty === true) sub += Math.round(qty * QUOTE_ADDON_WARRANTY_USD * m);
  return sub;
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
      const eq = quoteCartLineEquipmentSubtotalUsd(l);
      const m = shareAddonMult(l);
      const addons: string[] = [];
      if (l.includeSetup) {
        const unit = quoteCartSetupUnitUsd(l, pricing);
        addons.push(
          `Setup en granja: ${unit.toLocaleString("es-PY")} USD × ${l.qty} u. = ${(l.qty * unit).toLocaleString("es-PY")} USD`
        );
      }
      if (l.includeWarranty) {
        const unit = Math.round(QUOTE_ADDON_WARRANTY_USD * m);
        addons.push(
          `Garantía: ${unit.toLocaleString("es-PY")} USD × ${l.qty} u. = ${(l.qty * unit).toLocaleString("es-PY")} USD`
        );
      }
      const addonBlock = addons.length ? `\n   ${addons.join("\n   ")}` : "";
      const sub = quoteCartLineSubtotalUsd(l, pricing);
      return (
        `${i + 1}) ${l.brand} ${l.model} — ${l.hashrate}${shareNote}\n` +
        `   Cantidad: ${l.qty} — Precio ref. unit.: ${l.priceLabel} — Equipo: ${eq.toLocaleString("es-PY")} USD` +
        addonBlock +
        `\n   Subtotal ref. línea: ${sub.toLocaleString("es-PY")} USD`
      );
    })
    .join("\n\n");
  const total = quoteCartSubtotalUsd(lines, pricing);
  const footer =
    `\n\n—\nTotal referencial (USD): ${total.toLocaleString("es-PY")} — sujeto a confirmación, impuestos y disponibilidad.\n\nGracias.`;
  let out = header + body + footer;
  if (ref) out += ticketRefFooter(ref.orderNumber, ref.ticketCode);
  return out;
}

export function buildQuoteMailto(
  lines: QuoteCartLine[],
  ref?: { orderNumber: string; ticketCode: string },
  pricing: QuoteCartPricing = {}
): string {
  const subject = encodeURIComponent(
    lines.length === 0
      ? "Cotización marketplace ASIC"
      : `Cotización marketplace — ${lines.length} ítem(s) — ref. ${quoteCartSubtotalUsd(lines, pricing).toLocaleString("es-PY")} USD`
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
