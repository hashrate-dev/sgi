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

/**
 * Prefijo correcto para `/images/...` cuando la app se publica bajo un subpath (`base` en Vite).
 * No altera URLs absolutas ni `data:`.
 */
export function publicImageUrl(path: string): string {
  const p = (path ?? "").trim();
  if (!p) return "";
  if (/^(https?:|data:)/i.test(p)) return p;
  let normBase = "";
  try {
    const b = import.meta.env?.BASE_URL;
    if (typeof b === "string" && b !== "/" && b.trim() !== "") {
      normBase = b.replace(/\/$/, "");
    }
  } catch {
    normBase = "";
  }
  const pathPart = p.startsWith("/") ? p : `/${p}`;
  return normBase ? `${normBase}${pathPart}` : pathPart;
}

/**
 * Foto de catálogo en `client/public/images` cuando `mp_image_src` está vacío o no carga
 * (mismos assets que el seed de vitrina / catálogo estático).
 */
export function defaultAsicShelfImageSrc(brand: string, model: string): string {
  const t = `${brand} ${model}`.toLowerCase().replace(/\s+/g, " ");
  let file: string | null = null;
  if (/\b(?:antminer\s+)?l9\b/.test(t)) file = "L9-catalog.png";
  else if (/\b(?:antminer\s+)?s21\b/.test(t)) file = "S21-catalog.png";
  else if (/\bz15\b/.test(t)) file = "bitmain-z15-pro.png";
  if (!file) return "";
  return `/images/${encodeURIComponent(file)}`;
}

/** Fallback local si la API no responde (vacío: vitrina solo desde BD). */
export const ASIC_MARKETPLACE_PRODUCTS: AsicProduct[] = [];

/** Extras de vitrina bajo “Servicio todo incluido” en `/marketplace/home` (vacío = sin fichas estáticas mergeadas). */
export const CORP_HOME_GRID_PRODUCT_IDS = [] as const;

/**
 * Heurística por nombre sobre el catálogo vitrina (HW5 → MD5 → HD5 → Antrack → S21 Hydro).
 * La home `/marketplace/home` ya usa IDs guardados en BD; se exporta por si se reutiliza en otro flujo.
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

/** Solo Antminer S21 XP a 270 TH/s (ficha desde API / vitrina). */
export function productSupportsHashrateShare(product: AsicProduct): boolean {
  if (!asicProductShowsMinerEconomyContent(product)) return false;
  const raw = product.priceDisplayLabel?.trim();
  if (raw && normalizeConsultPriceLabelForDisplay(raw)) return false;
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
