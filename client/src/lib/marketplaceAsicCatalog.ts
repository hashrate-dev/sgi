/**
 * Catálogo Marketplace ASIC (Hashrate Space).
 * Fotos en `client/public/images/` — nombres con espacio tal cual en disco (Vite las sirve en `/images/...`).
 */

export type AsicAlgo = "sha256" | "scrypt";

export type AsicDetailIcon = "bolt" | "chip" | "sun" | "fan" | "droplet" | "btc" | "dual";

/** Números del catálogo / UI: miles con punto (3.800), decimal con coma (0,000127). */
export function parseLocaleNumberForDisplay(numStr: string): number | null {
  const s = numStr.trim().replace(/\s/g, "");
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return parseFloat(s.replace(/\./g, ""));
  }
  if (/,/.test(s)) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const enLang = (lang?: string) => lang === "en" || lang === "en-US";

/** Hashrate visible (TH/s o MH/s) prorrateado por fracción del mismo equipo. */
export function scaleHashrateDisplay(hashrate: string, factor: number, lang?: string): string {
  if (factor >= 0.999) return hashrate;
  const loc = enLang(lang) ? "en-US" : "es-PY";
  const trimmed = hashrate.trim();
  const th = /([\d.,]+)\s*TH\/s/i.exec(trimmed);
  if (th) {
    const v = parseLocaleNumberForDisplay(th[1]);
    if (v == null) return hashrate;
    const scaled = v * factor;
    const num =
      scaled >= 100
        ? scaled.toLocaleString(loc, { maximumFractionDigits: 1 })
        : scaled.toLocaleString(loc, { maximumFractionDigits: 2 });
    return `${num} TH/s`;
  }
  const mh = /([\d.,]+)\s*MH\/s/i.exec(trimmed);
  if (mh) {
    const v = parseLocaleNumberForDisplay(mh[1]);
    if (v == null) return hashrate;
    const scaled = v * factor;
    const num = scaled.toLocaleString(loc, { maximumFractionDigits: 0 });
    return `${num} MH/s`;
  }
  return hashrate;
}

/** Texto de fila de potencia "3.800 W" (y similares) prorrateado. */
export function scaleWattDetailText(text: string, factor: number, lang?: string): string {
  if (factor >= 0.999) return text;
  const loc = enLang(lang) ? "en-US" : "es-PY";
  return text.replace(/(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*W\b/gi, (full, wattStr: string) => {
    const v = parseLocaleNumberForDisplay(wattStr);
    if (v == null) return full;
    const scaled = v * factor;
    const formatted = Math.round(scaled).toLocaleString(loc, { maximumFractionDigits: 0 });
    return `${formatted} W`;
  });
}

export function scaleDetailRowTextForShare(
  row: { icon: AsicDetailIcon; text: string },
  factor: number,
  lang?: string
): string {
  if (factor >= 0.999) return row.text;
  if (row.icon === "bolt") return scaleWattDetailText(row.text, factor, lang);
  return row.text;
}

/** Escala cantidades en líneas de rendimiento (~BTC, USDT, LTC, DOGE). */
export function scaleYieldDisplayLine(line: string, factor: number, lang?: string): string {
  if (factor >= 0.999) return line;
  const loc = enLang(lang) ? "en-US" : "es-PY";
  const fmtBtc = (n: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 6, maximumFractionDigits: 10 });
  const fmtDec = (n: number, maxFrac: number) =>
    n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: maxFrac });

  let out = line;
  out = out.replace(/(~\s*)([\d.,]+)(\s*BTC)/gi, (_m, pre: string, num: string, suf: string) => {
    const v = parseLocaleNumberForDisplay(num);
    return v == null ? `${pre}${num}${suf}` : `${pre}${fmtBtc(v * factor)}${suf}`;
  });
  out = out.replace(/(:\s*)(~?\s*)([\d.,]+)(\s*BTC)/gi, (_m, colon: string, tilde: string, num: string, suf: string) => {
    const v = parseLocaleNumberForDisplay(num);
    return v == null ? `${colon}${tilde}${num}${suf}` : `${colon}${tilde}${fmtBtc(v * factor)}${suf}`;
  });
  out = out.replace(/(≈\s*)([\d.,]+)(\s*USDT)/gi, (_m, pre: string, num: string, suf: string) => {
    const v = parseLocaleNumberForDisplay(num);
    return v == null ? `${pre}${num}${suf}` : `${pre}${fmtDec(v * factor, 2)}${suf}`;
  });
  out = out.replace(/(~\s*)([\d.,]+)(\s*LTC)/gi, (_m, pre: string, num: string, suf: string) => {
    const v = parseLocaleNumberForDisplay(num);
    return v == null ? `${pre}${num}${suf}` : `${pre}${fmtDec(v * factor, 5)}${suf}`;
  });
  out = out.replace(/(~\s*)([\d.,]+)(\s*DOGE)/gi, (_m, pre: string, num: string, suf: string) => {
    const v = parseLocaleNumberForDisplay(num);
    return v == null ? `${pre}${num}${suf}` : `${pre}${Math.round(v * factor).toLocaleString(loc)}${suf}`;
  });
  return out;
}

/** Textos de rendimiento (compactos: las etiquetas del modal dan el contexto). */
export type AsicEstimatedYield = {
  /** Ej: "~0,00011572 BTC" */
  line1: string;
  /** Ej: "≈ 7,80 USDT" */
  line2: string;
};

export type AsicProduct = {
  /** ID en BD (`equipos_asic`) o fallback estático */
  id: string;
  algo: AsicAlgo;
  brand: string;
  model: string;
  hashrate: string;
  /** precio entero USD (para mailto / modal) */
  priceUsd: number;
  /** Ruta pública de la foto principal; vacío = listado sin imagen (sin placeholder de catálogo). */
  imageSrc: string;
  /** Miniaturas galería modal; si falta y hay `imageSrc`, el modal usa solo la principal. */
  gallerySrcs?: string[];
  detailRows: Array<{ icon: AsicDetailIcon; text: string }>;
  estimatedYield: AsicEstimatedYield;
};

/** Ruta pública bajo `client/public/images/` (codifica espacios en nombres de archivo). */
function img(file: string): string {
  return `/images/${encodeURIComponent(file)}`;
}

/** Misma foto oficial para los tres listados Antminer S21 (`client/public/images/S21-catalog.png`). */
const IMG_S21 = img("S21-catalog.png");

/** Galería del modal (detalle) — S21: fotos adicionales; el ítem del marketplace sigue usando `IMG_S21`. */
const GALLERY_S21 = [img("S21 - 1.jpg"), img("S21 - 5.png"), img("S21 - 6.png"), img("S21 - 7.png")];

/** Misma foto oficial para los cuatro listados Antminer L9 (`client/public/images/L9-catalog.png`). */
const IMG_L9 = img("L9-catalog.png");

/** Galería del modal (detalle) — L9: 3 fotos; la tarjeta del marketplace sigue usando `IMG_L9`. */
const GALLERY_L9 = [img("L9 - 1.jpg"), img("L9 - 2.png"), img("L9 - 3.png")];

/** Fallback local si la API no responde (mismo contenido que seed del servidor). */
export const ASIC_MARKETPLACE_PRODUCTS: AsicProduct[] = [
  /* —— Bitcoin / SHA-256: Antminer S21 —— */
  {
    id: "fallback-s21-pro-235",
    algo: "sha256",
    brand: "Bitmain",
    model: "Antminer S21 Pro",
    hashrate: "235 TH/s",
    priceUsd: 4990,
    imageSrc: IMG_S21,
    gallerySrcs: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.950 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    estimatedYield: {
      line1: "Por día: ~0,000111 BTC",
      line2: "Equivalente diario (USDT): ≈ 7,48 USDT",
    },
  },
  {
    id: "fallback-s21-pro-245",
    algo: "sha256",
    brand: "Bitmain",
    model: "Antminer S21 Pro",
    hashrate: "245 TH/s",
    priceUsd: 5200,
    imageSrc: IMG_S21,
    gallerySrcs: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.950 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    estimatedYield: {
      line1: "~0,00011572 BTC",
      line2: "≈ 7,80 USDT",
    },
  },
  {
    id: "fallback-s21-xp-270",
    algo: "sha256",
    brand: "Bitmain",
    model: "Antminer S21 XP",
    hashrate: "270 TH/s",
    priceUsd: 5900,
    imageSrc: IMG_S21,
    gallerySrcs: GALLERY_S21,
    detailRows: [
      { icon: "bolt", text: "3.800 W" },
      { icon: "chip", text: "BTC / BCH / BSV · SHA-256" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "btc", text: "Minería Bitcoin" },
    ],
    estimatedYield: {
      line1: "~0,000127 BTC",
      line2: "≈ 8,60 USDT",
    },
  },
  /* —— Litecoin + Dogecoin / Scrypt: Antminer L9 —— */
  {
    id: "fallback-l9-15g",
    algo: "scrypt",
    brand: "Bitmain",
    model: "Antminer L9",
    hashrate: "15.000 MH/s",
    priceUsd: 5700,
    imageSrc: IMG_L9,
    gallerySrcs: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    estimatedYield: {
      line1: "~0,01914 LTC + ~72 DOGE",
      line2: "≈ 7,5 USDT",
    },
  },
  {
    id: "fallback-l9-16g",
    algo: "scrypt",
    brand: "Bitmain",
    model: "Antminer L9",
    hashrate: "16.000 MH/s",
    priceUsd: 6100,
    imageSrc: IMG_L9,
    gallerySrcs: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    estimatedYield: {
      line1: "~0,02042 LTC + ~77 DOGE",
      line2: "≈ 8 USDT",
    },
  },
  {
    id: "fallback-l9-165g",
    algo: "scrypt",
    brand: "Bitmain",
    model: "Antminer L9",
    hashrate: "16.500 MH/s",
    priceUsd: 6200,
    imageSrc: IMG_L9,
    gallerySrcs: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    estimatedYield: {
      line1: "~0,02106 LTC + ~79 DOGE",
      line2: "≈ 8,2 USDT",
    },
  },
  {
    id: "fallback-l9-17g",
    algo: "scrypt",
    brand: "Bitmain",
    model: "Antminer L9",
    hashrate: "17.000 MH/s",
    priceUsd: 6600,
    imageSrc: IMG_L9,
    gallerySrcs: GALLERY_L9,
    detailRows: [
      { icon: "bolt", text: "3.400 W" },
      { icon: "chip", text: "DOGE + LTC · Scrypt" },
      { icon: "fan", text: "Minero de Aire" },
      { icon: "dual", text: "Minería Dual" },
    ],
    estimatedYield: {
      line1: "~0,02169 LTC + ~82 DOGE",
      line2: "≈ 8,5 USDT",
    },
  },
];

export const ASIC_FILTER_GROUPS = [
  { id: "sha256" as const, label: "Bitcoin" },
  { id: "scrypt" as const, label: "DOGE + LTC" },
];

/** Compra por fracción de hashrate de **un** equipo (cotización). Incluye equipo completo. */
export const HASHRATE_SHARE_OPTIONS = [100, 75, 50, 25] as const;
export type HashrateSharePct = (typeof HASHRATE_SHARE_OPTIONS)[number];

/** Solo Antminer S21 XP a 270 TH/s (catálogo estático o misma ficha desde API). */
export function productSupportsHashrateShare(product: AsicProduct): boolean {
  if (product.id === "fallback-s21-xp-270") return true;
  return /\bS21\s+XP\b/i.test(product.model.trim()) && /270/i.test(product.hashrate) && /TH\//i.test(product.hashrate);
}

/** Precio referencial USD del equipo según % de hashrate (redondeado). */
export function proratedEquipmentPriceUsd(product: AsicProduct, sharePct: number): number {
  const pct = Math.min(100, Math.max(1, Math.round(sharePct)));
  return Math.max(0, Math.round((product.priceUsd * pct) / 100));
}

export function formatAsicPriceUsd(n: number, langOrLocale?: string): string {
  const loc =
    langOrLocale === "en" || langOrLocale === "en-US"
      ? "en-US"
      : langOrLocale === "es" || !langOrLocale
        ? "es-PY"
        : langOrLocale;
  return `${n.toLocaleString(loc)} USD`;
}
