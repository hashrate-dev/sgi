import { db } from "../db.js";
import { ensureItemsGarantiaAndePrecioColumn } from "./ensureItemsGarantiaAndePrecio.js";

export type GarantiaQuoteRow = {
  codigo: string;
  marca: string;
  modelo: string;
  precioGarantia: number;
};

/** Si no hay fila en `items_garantia_ande` o no coincide marca/modelo/código. */
export const DEFAULT_QUOTE_WARRANTY_USD = 200;

function norm(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Precio garantía ANDE para una línea del carrito/ticket.
 * 1) `codigo` del ítem = `productId` (UUID vitrina o código interno).
 * 2) `marca` + `modelo` del ítem = `brand` + `model` de la línea (p. ej. Bitmain + Antminer Z15).
 */
export function resolveWarrantyUsdForQuoteLine(
  line: { productId: string; brand: string; model: string },
  items: readonly GarantiaQuoteRow[] | undefined | null
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

export async function loadGarantiaQuoteRows(): Promise<GarantiaQuoteRow[]> {
  await ensureItemsGarantiaAndePrecioColumn();
  type Raw = { codigo: string | null; marca: string | null; modelo: string | null; precio_garantia?: number | null };

  async function loadWithPrecio(): Promise<Raw[]> {
    return (await db
      .prepare(`SELECT codigo, marca, modelo, precio_garantia FROM items_garantia_ande ORDER BY codigo`)
      .all()) as Raw[];
  }

  async function loadSansPrecio(): Promise<Raw[]> {
    return (await db.prepare(`SELECT codigo, marca, modelo FROM items_garantia_ande ORDER BY codigo`).all()) as Raw[];
  }

  let rows: Raw[];
  try {
    rows = await loadWithPrecio();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (
      m.toLowerCase().includes("precio_garantia") ||
      m.includes("no such column") ||
      m.includes("42703")
    ) {
      try {
        rows = await loadSansPrecio();
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
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
    precioGarantia: Number(r.precio_garantia),
  }));
}
