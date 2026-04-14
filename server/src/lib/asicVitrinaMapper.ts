/**
 * Mapea filas `equipos_asic` (con columnas marketplace) al JSON del catálogo ASIC vitrina.
 */

export type AsicAlgo = "sha256" | "scrypt";
export type AsicDetailIcon = "bolt" | "chip" | "sun" | "fan" | "droplet" | "btc" | "dual";

/** Alineado con client/src/lib/marketplaceAsicCatalog (sufijos / textos legacy en mp_price_label). */
function normalizeConsultPriceLabelForDisplay(label: string): string {
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

export type VitrinaListingKind = "miner" | "infrastructure";

function inferMinerListingFromTitles(brand: string, model: string): boolean {
  const s = `${brand} ${model}`.toLowerCase();
  if (/\bantrack\b/.test(s)) return false;
  if (/\bpdu\b|patch panel\b|bandeja rack|shelf rack|contenedor\b|\bcontainer\b|\bantspace\b/i.test(s))
    return false;
  if (/\brack\b/.test(s) && !/\bantminer\b/i.test(s)) return false;
  return true;
}

export function resolveVitrinaListingKind(row: {
  mp_listing_kind?: string | null;
  marca_equipo: string;
  modelo: string;
}): VitrinaListingKind {
  const raw = (row.mp_listing_kind ?? "").trim().toLowerCase();
  if (raw === "infrastructure") return "infrastructure";
  if (raw === "miner") return "miner";
  return inferMinerListingFromTitles(row.marca_equipo ?? "", row.modelo ?? "") ? "miner" : "infrastructure";
}

export type VitrinaAsicProduct = {
  id: string;
  algo: AsicAlgo;
  brand: string;
  model: string;
  hashrate: string;
  priceUsd: number;
  /** Si viene de `mp_price_label`, la vitrina muestra este texto en lugar de «X USD». */
  priceDisplayLabel?: string;
  /** Vacío si no hay `mp_image_src`; la tienda no usa imagen de relleno. */
  imageSrc: string;
  gallerySrcs?: string[];
  detailRows: Array<{ icon: AsicDetailIcon; text: string }>;
  estimatedYield: { line1: string; line2: string };
  /** Minero vs rack/PDU: la tienda oculta rendimiento estimado y tarifa hosting si no es minero. */
  listingKind: VitrinaListingKind;
};

function defaultDetailRows(algo: AsicAlgo): VitrinaAsicProduct["detailRows"] {
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

function defaultYield(algo: AsicAlgo): { line1: string; line2: string } {
  if (algo === "sha256") {
    return {
      line1: "Consultar rendimiento",
      line2: "—",
    };
  }
  return {
    line1: "Consultar rendimiento (dual)",
    line2: "—",
  };
}

function parseAlgo(v: string | null | undefined): AsicAlgo | null {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "sha256" || s === "scrypt") return s;
  return null;
}

export type EquipoAsicVitrinaRow = {
  id: string;
  marca_equipo: string;
  modelo: string;
  procesador: string;
  precio_usd: number;
  mp_algo: string | null;
  mp_hashrate_display: string | null;
  mp_image_src: string | null;
  mp_gallery_json: string | null;
  mp_detail_rows_json: string | null;
  mp_yield_json: string | null;
  mp_price_label?: string | null;
  mp_listing_kind?: string | null;
};

export function mapEquipoRowToVitrina(row: EquipoAsicVitrinaRow): VitrinaAsicProduct | null {
  const algo = parseAlgo(row.mp_algo);
  if (!algo) return null;

  const hashrate = (row.procesador ?? "").trim() || "—";

  let gallerySrcs: string[] | undefined;
  if (row.mp_gallery_json?.trim()) {
    try {
      const g = JSON.parse(row.mp_gallery_json) as unknown;
      if (Array.isArray(g) && g.every((x) => typeof x === "string" && x.trim())) {
        gallerySrcs = (g as string[]).map((x) => x.trim()).filter(Boolean);
      }
    } catch {
      /* usar solo imagen principal */
    }
  }

  let detailRows = defaultDetailRows(algo);
  if (row.mp_detail_rows_json?.trim()) {
    try {
      const d = JSON.parse(row.mp_detail_rows_json) as unknown;
      if (Array.isArray(d) && d.length > 0) {
        const good = d.every(
          (x) =>
            x &&
            typeof x === "object" &&
            typeof (x as { icon?: string }).icon === "string" &&
            typeof (x as { text?: string }).text === "string"
        );
        if (good) detailRows = d as VitrinaAsicProduct["detailRows"];
      }
    } catch {
      /* defaults */
    }
  }

  let estimatedYield = defaultYield(algo);
  if (row.mp_yield_json?.trim()) {
    try {
      const y = JSON.parse(row.mp_yield_json) as { line1?: string; line2?: string };
      if (y.line1 != null) estimatedYield = { ...estimatedYield, line1: String(y.line1) };
      if (y.line2 != null) estimatedYield = { ...estimatedYield, line2: String(y.line2) };
    } catch {
      /* defaults */
    }
  }

  /** Sin imagen principal en BD → cadena vacía (la tienda no muestra foto genérica). */
  const imageSrc = (row.mp_image_src ?? "").trim();
  const priceUsd = Math.max(0, Math.round(Number(row.precio_usd) || 0));
  const labelRaw = (row.mp_price_label ?? "").trim();
  const labelNorm = labelRaw ? normalizeConsultPriceLabelForDisplay(labelRaw) : "";
  const priceDisplayLabel = priceUsd <= 0 && labelNorm ? labelNorm : undefined;

  const listingKind = resolveVitrinaListingKind(row);

  return {
    id: row.id,
    algo,
    brand: (row.marca_equipo ?? "").trim(),
    model: (row.modelo ?? "").trim(),
    hashrate,
    priceUsd,
    ...(priceDisplayLabel ? { priceDisplayLabel } : {}),
    imageSrc,
    gallerySrcs: gallerySrcs?.length ? gallerySrcs : undefined,
    detailRows,
    estimatedYield,
    listingKind,
  };
}
