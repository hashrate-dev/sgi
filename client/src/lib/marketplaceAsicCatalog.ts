/**
 * Catálogo Marketplace ASIC (Hashrate Space).
 * Fotos en `client/public/images/` — nombres con espacio tal cual en disco (Vite las sirve en `/images/...`).
 */

import { marketplaceLocale } from "./i18n.js";

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

/** Hashrate visible (TH/s o MH/s) prorrateado por fracción del mismo equipo. */
export function scaleHashrateDisplay(hashrate: string, factor: number, lang?: string): string {
  if (factor >= 0.999) return hashrate;
  const loc = marketplaceLocale(lang ?? "es");
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
  const loc = marketplaceLocale(lang ?? "es");
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
  const loc = marketplaceLocale(lang ?? "es");
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

/** Catálogo: minero ASIC vs rack/PDU/infra (modal sin rendimiento ni tarifa hosting). */
export type MarketplaceListingKind = "miner" | "infrastructure";

export type AsicListingTitleFields = {
  brand: string;
  model: string;
  listingKind?: MarketplaceListingKind;
};

/** Heurística por nombre cuando en BD está en «automático» (NULL). */
export function inferMinerListingFromTitles(brand: string, model: string): boolean {
  const s = `${brand} ${model}`.toLowerCase();
  if (/\bantrack\b/.test(s)) return false;
  if (/\bpdu\b|patch panel\b|bandeja rack|shelf rack|contenedor\b|\bcontainer\b|\bantspace\b/i.test(s))
    return false;
  if (/\brack\b/.test(s) && !/\bantminer\b/i.test(s)) return false;
  return true;
}

/** Resuelve tipo de ficha para UI (modal tienda): honor explícito en `listingKind` o inferencia por título. */
export function resolveMarketplaceListingKind(p: AsicListingTitleFields): MarketplaceListingKind {
  if (p.listingKind === "infrastructure") return "infrastructure";
  if (p.listingKind === "miner") return "miner";
  return inferMinerListingFromTitles(p.brand, p.model) ? "miner" : "infrastructure";
}

/** Rendimiento estimado + bloque hosting del modal solo para fichas tipo minero. */
export function asicProductShowsMinerEconomyContent(p: AsicListingTitleFields): boolean {
  return resolveMarketplaceListingKind(p) === "miner";
}

function textBlobForShelfSort(p: AsicProduct): string {
  return `${p.brand} ${p.model} ${p.hashrate} ${p.detailRows.map((r) => r.text).join(" ")}`.toLowerCase();
}

/**
 * Minero refrigeración líquida / Hydro / inmersión (no “de aire”): va después de mineros de aire.
 */
export function isHydroOrLiquidCooledMiner(p: AsicProduct): boolean {
  if (!asicProductShowsMinerEconomyContent(p)) return false;
  const t = textBlobForShelfSort(p);
  if (/\bhydro\b/.test(t)) return true;
  if (/inmersi[oó]n|immersion/.test(t)) return true;
  if (/refrigeraci[oó]n\s+por\s+agua|liquid\s+cooling|enfriamiento\s+l[ií]quido/.test(t)) return true;
  if (
    p.detailRows.some(
      (r) =>
        r.icon === "droplet" &&
        /(agua|l[ií]quid|hydro|inmers|immersion|rack\s+cooling)/i.test(r.text)
    )
  ) {
    return true;
  }
  return false;
}

function isZcashAirFamily(p: AsicProduct): boolean {
  const t = textBlobForShelfSort(p);
  if (/\bz15\b/.test(t)) return true;
  if (/\bzcash\b/.test(t) || /\bzec\b/.test(t) || /equihash/.test(t)) return true;
  if (/k\s*sol\/s/i.test(p.hashrate) || /\bksol\b/i.test(t)) return true;
  return false;
}

function isAntminerL9(p: AsicProduct): boolean {
  return /\bl9\b/i.test(`${p.brand} ${p.model}`);
}

/**
 * Grupo para ordenar la grilla `/marketplace` (app.hashrate.space):
 * 0 = minero de aire Bitcoin (SHA-256, sin Z15/Zcash),
 * 1 = Zcash / Z15 / Equihash,
 * 2 = Antminer L9,
 * 3 = otro minero de aire,
 * 4 = Hydro / líquido,
 * 5 = infra (contenedores, racks, PDU…).
 */
export function marketplaceShelfPrimaryGroup(p: AsicProduct): number {
  if (resolveMarketplaceListingKind(p) === "infrastructure") return 5;
  if (!asicProductShowsMinerEconomyContent(p)) return 5;
  if (isHydroOrLiquidCooledMiner(p)) return 4;
  if (isZcashAirFamily(p)) return 1;
  if (isAntminerL9(p)) return 2;
  if (p.algo === "sha256") return 0;
  return 3;
}

export function compareMarketplaceShelfProducts(a: AsicProduct, b: AsicProduct, sortLocale: string): number {
  const ga = marketplaceShelfPrimaryGroup(a);
  const gb = marketplaceShelfPrimaryGroup(b);
  if (ga !== gb) return ga - gb;
  const label = (p: AsicProduct) => `${p.brand} ${p.model}`.toLowerCase();
  return label(a).localeCompare(label(b), sortLocale);
}

export type AsicProduct = {
  /** ID en BD (`equipos_asic`) o fallback estático */
  id: string;
  algo: AsicAlgo;
  brand: string;
  model: string;
  hashrate: string;
  /** precio entero USD (para mailto / modal) */
  priceUsd: number;
  /** Si existe, se muestra en vitrina/modal en lugar de «X USD» (precio bajo consulta). */
  priceDisplayLabel?: string;
  /** Ruta pública de la foto principal; vacío = listado sin imagen (sin placeholder de catálogo). */
  imageSrc: string;
  /** Miniaturas galería modal; si falta y hay `imageSrc`, el modal usa solo la principal. */
  gallerySrcs?: string[];
  detailRows: Array<{ icon: AsicDetailIcon; text: string }>;
  estimatedYield: AsicEstimatedYield;
  /**
   * Opcional: forzar minero vs infra. Si falta, se infiere por marca/modelo (ej. Antrack → infra).
   * En API vitrina suele venir resuelto desde `mp_listing_kind` + inferencia.
   */
  listingKind?: MarketplaceListingKind;
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

/** Extras de vitrina bajo “Servicio todo incluido” en `/marketplace/home` (vacío = sin fichas estáticas mergeadas). */
export const CORP_HOME_GRID_PRODUCT_IDS = [] as const;

/**
 * Sección “Equipos más vendidos” en `/marketplace/home`: mineros de catálogo (no infra Hydro/Antrack).
 * Orden: S21 XP → S21 Pro (2 hashrates) → L9 representativo.
 */
export const CORP_HOME_BEST_SELLING_PRODUCT_IDS = [
  "fallback-s21-xp-270",
  "fallback-s21-pro-245",
  "fallback-s21-pro-235",
  "fallback-l9-16g",
] as const;

/**
 * Home “Otros Productos Interesantes”: elige hasta 5 equipos **solo** entre los que devuelve la vitrina (BD).
 * Orden: contenedor HW5 → MD5 → HD5 → rack Antrack → minero S21 Hydro.
 */
export function pickCorpHomeInterestingFromVitrina(products: AsicProduct[]): AsicProduct[] {
  const line = (p: AsicProduct) => `${p.brand} ${p.model} ${p.hashrate}`.toLowerCase().replace(/\s+/g, " ");
  const used = new Set<string>();
  const pick = (test: (s: string) => boolean): AsicProduct | undefined => {
    const hit = products.find((p) => !used.has(p.id) && test(line(p)));
    if (hit) used.add(hit.id);
    return hit;
  };
  const hw5 = pick((s) => /\bhw5\b/.test(s) && (/\bantspace\b/.test(s) || /\bcontainer\b/.test(s)));
  const md5 = pick((s) => /\bmd5\b/.test(s) && (/\bantspace\b/.test(s) || /\bcontainer\b/.test(s)));
  const hd5 = pick((s) => /\bhd5\b/.test(s) && (/\bantspace\b/.test(s) || /\bcontainer\b/.test(s)));
  const antrack = pick((s) => /\bantrack\b/.test(s));
  const s21hydro = pick((s) => /\bs21\b/.test(s) && /\bhydro\b/.test(s));
  return [hw5, md5, hd5, antrack, s21hydro].filter((x): x is AsicProduct => Boolean(x));
}

/** Añade fichas promo corporativas si la API no las trae (mismos ids que catálogo estático). */
export function mergeAsicCatalogWithCorpGridExtras(apiProducts: AsicProduct[]): AsicProduct[] {
  const apiIds = new Set(apiProducts.map((p) => p.id));
  const extras = CORP_HOME_GRID_PRODUCT_IDS.map((id) => ASIC_MARKETPLACE_PRODUCTS.find((p) => p.id === id)).filter(
    (p): p is AsicProduct => Boolean(p && !apiIds.has(p.id))
  );
  return [...apiProducts, ...extras];
}

export type MarketplaceCatalogFilter = "sha256" | "scrypt" | "zcash" | "other";

export const ASIC_FILTER_GROUPS: ReadonlyArray<{ id: MarketplaceCatalogFilter; label: string }> = [
  { id: "sha256", label: "Bitcoin" },
  { id: "scrypt", label: "DOGE + LTC" },
  { id: "zcash", label: "Zcash" },
  { id: "other", label: "Otros" },
];

/** Compra por fracción de hashrate de **un** equipo (cotización). Incluye equipo completo. */
export const HASHRATE_SHARE_OPTIONS = [100, 75, 50, 25] as const;
export type HashrateSharePct = (typeof HASHRATE_SHARE_OPTIONS)[number];

/** Solo Antminer S21 XP a 270 TH/s (catálogo estático o misma ficha desde API). */
export function productSupportsHashrateShare(product: AsicProduct): boolean {
  if (!asicProductShowsMinerEconomyContent(product)) return false;
  const raw = product.priceDisplayLabel?.trim();
  if (raw && normalizeConsultPriceLabelForDisplay(raw)) return false;
  if (product.id === "fallback-s21-xp-270") return true;
  return /\bS21\s+XP\b/i.test(product.model.trim()) && /270/i.test(product.hashrate) && /TH\//i.test(product.hashrate);
}

/** Precio referencial USD del equipo según % de hashrate (redondeado). */
export function proratedEquipmentPriceUsd(product: AsicProduct, sharePct: number): number {
  const raw = product.priceDisplayLabel?.trim();
  if (raw && normalizeConsultPriceLabelForDisplay(raw)) return 0;
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

/**
 * Quita el sufijo antiguo del texto comercial (p. ej. «— te asesoramos sin compromiso»),
 * y unifica textos legacy al mensaje actual de vitrina.
 */
export function normalizeConsultPriceLabelForDisplay(label: string): string {
  let s = label
    .replace(/\s*[—–-]\s*te asesoramos sin compromiso\.?\s*$/i, "")
    .trim();
  if (/^solicit[áa]\s+tu\s+cotizaci[oó]n\.?$/iu.test(s)) {
    return "SOLICITA PRECIO";
  }
  if (/^solicit[áa]\s+precio\.?$/iu.test(s)) {
    return "SOLICITA PRECIO";
  }
  return s;
}

/** Precio en tarjeta/modal: texto comercial o USD formateado. */
export function formatAsicProductPriceDisplay(product: AsicProduct, langOrLocale?: string): string {
  const lb = product.priceDisplayLabel?.trim();
  if (lb) {
    const n = normalizeConsultPriceLabelForDisplay(lb);
    if (n) return n;
  }
  return formatAsicPriceUsd(product.priceUsd, langOrLocale);
}
