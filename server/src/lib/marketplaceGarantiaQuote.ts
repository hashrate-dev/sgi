import { db } from "../db.js";
import { ensureItemsGarantiaAndePrecioColumn } from "./ensureItemsGarantiaAndePrecio.js";
import { ensureItemsGarantiaAndeMarketplaceEquipoColumn } from "./ensureItemsGarantiaAndeMarketplaceEquipoColumn.js";

export type GarantiaQuoteRow = {
  codigo: string;
  marca: string;
  modelo: string;
  marketplaceEquipoId?: string | null;
  precioGarantia: number;
};

/** Si no hay fila en `items_garantia_ande` o no coincide marca/modelo/código. */
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

/**
 * Precio garantía ANDE para una línea del carrito/ticket.
 * 1) `codigo` del ítem = `productId` (UUID vitrina o código interno).
 * 2) `marca` + `modelo` del ítem = `brand` + `model` de la línea (p. ej. Bitmain + Antminer Z15).
 */
export function resolveWarrantyUsdForQuoteLine(
  line: { productId: string; brand: string; model: string; hashrate?: string },
  items: readonly GarantiaQuoteRow[] | undefined | null
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

export async function loadGarantiaQuoteRows(): Promise<GarantiaQuoteRow[]> {
  await ensureItemsGarantiaAndePrecioColumn();
  await ensureItemsGarantiaAndeMarketplaceEquipoColumn();
  type Raw = {
    codigo: string | null;
    marca: string | null;
    modelo: string | null;
    marketplace_equipo_id?: string | null;
    precio_garantia?: number | null;
  };

  async function loadWithPrecio(): Promise<Raw[]> {
    return (await db
      .prepare(`SELECT codigo, marca, modelo, marketplace_equipo_id, precio_garantia FROM items_garantia_ande ORDER BY codigo`)
      .all()) as Raw[];
  }

  async function loadWithPrecioSansMarketplace(): Promise<Raw[]> {
    return (await db
      .prepare(`SELECT codigo, marca, modelo, precio_garantia FROM items_garantia_ande ORDER BY codigo`)
      .all()) as Raw[];
  }

  async function loadSansPrecio(): Promise<Raw[]> {
    return (await db
      .prepare(`SELECT codigo, marca, modelo, marketplace_equipo_id FROM items_garantia_ande ORDER BY codigo`)
      .all()) as Raw[];
  }

  async function loadSansPrecioSansMarketplace(): Promise<Raw[]> {
    return (await db.prepare(`SELECT codigo, marca, modelo FROM items_garantia_ande ORDER BY codigo`).all()) as Raw[];
  }

  let rows: Raw[];
  try {
    rows = await loadWithPrecio();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.toLowerCase().includes("marketplace_equipo_id")) {
      try {
        rows = await loadWithPrecioSansMarketplace();
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        if (
          m2.toLowerCase().includes("precio_garantia") ||
          m2.includes("no such column") ||
          m2.includes("42703")
        ) {
          try {
            rows = await loadSansPrecioSansMarketplace();
          } catch (e3) {
            const m3 = e3 instanceof Error ? e3.message : String(e3);
            if (m3.includes("no such table") || (m3.toLowerCase().includes("items_garantia_ande") && m3.includes("does not exist"))) {
              return [];
            }
            // eslint-disable-next-line no-console
            console.warn("[loadGarantiaQuoteRows]", m3);
            return [];
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn("[loadGarantiaQuoteRows]", m2);
          return [];
        }
      }
    } else if (
      m.toLowerCase().includes("precio_garantia") ||
      m.includes("no such column") ||
      m.includes("42703")
    ) {
      try {
        rows = await loadSansPrecio();
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        if (m2.toLowerCase().includes("marketplace_equipo_id")) {
          try {
            rows = await loadSansPrecioSansMarketplace();
            return (Array.isArray(rows) ? rows : []).map((r) => ({
              codigo: String(r.codigo ?? "").trim(),
              marca: String(r.marca ?? "").trim(),
              modelo: String(r.modelo ?? "").trim(),
              marketplaceEquipoId:
                r.marketplace_equipo_id != null && String(r.marketplace_equipo_id).trim()
                  ? String(r.marketplace_equipo_id).trim()
                  : undefined,
              precioGarantia: Number(r.precio_garantia),
            }));
          } catch (e3) {
            const m3 = e3 instanceof Error ? e3.message : String(e3);
            if (m3.includes("no such table") || (m3.toLowerCase().includes("items_garantia_ande") && m3.includes("does not exist"))) {
              return [];
            }
            // eslint-disable-next-line no-console
            console.warn("[loadGarantiaQuoteRows]", m3);
            return [];
          }
        }
        if (m2.includes("no such table") || (m2.toLowerCase().includes("items_garantia_ande") && m2.includes("does not exist"))) {
          return [];
        }
        // eslint-disable-next-line no-console
        console.warn("[loadGarantiaQuoteRows]", m2);
        return [];
      }
    } else if (m.includes("no such table") || (m.toLowerCase().includes("items_garantia_ande") && m.includes("does not exist"))) {
      return [];
    } else {
      // eslint-disable-next-line no-console
      console.warn("[loadGarantiaQuoteRows]", m);
      return [];
    }
  }

  return (Array.isArray(rows) ? rows : []).map((r) => ({
    codigo: String(r.codigo ?? "").trim(),
    marca: String(r.marca ?? "").trim(),
    modelo: String(r.modelo ?? "").trim(),
    marketplaceEquipoId:
      r.marketplace_equipo_id != null && String(r.marketplace_equipo_id).trim()
        ? String(r.marketplace_equipo_id).trim()
        : undefined,
    precioGarantia: Number(r.precio_garantia),
  }));
}
