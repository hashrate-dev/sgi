/**
 * Precios de Setup para cotización marketplace (carrito).
 * - S02: equipo completo (1 o más unidades al 100%).
 * - S03 / nombre: fracción de hashrate (25/50/75%).
 * Fuente: tabla `setups` (gestión /equipos-asic/setup).
 */
import { db } from "../db.js";

const FALLBACK_USD = 50;
const CODIGO_EQUIPO_COMPLETO = "S02";
const CODIGO_HASHRATE_SHARE = "S03";
const NAME_SUBSTRING = "setup compra hashrate";

/** Fila reservada para cotización marketplace: no eliminar desde gestión Setup. */
export function isSetupCompraHashrateProtected(codigo: string | null | undefined, nombre: string | null | undefined): boolean {
  const c = String(codigo ?? "").trim().toUpperCase();
  if (c === CODIGO_HASHRATE_SHARE) return true;
  return String(nombre ?? "").trim().toLowerCase().includes(NAME_SUBSTRING);
}

function normalizeUsd(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 999_999) return null;
  return Math.round(n);
}

/**
 * Resuelve precio USD del setup para líneas de equipo completo (código S02).
 */
export async function resolveSetupEquipoCompletoUsd(): Promise<number> {
  try {
    const sql = `SELECT precio_usd FROM setups WHERE UPPER(TRIM(COALESCE(codigo, ''))) = ? LIMIT 1`;
    const row = (await db.prepare(sql).get(CODIGO_EQUIPO_COMPLETO)) as { precio_usd?: unknown } | undefined;
    const u = row != null ? normalizeUsd(row.precio_usd) : null;
    if (u != null) return u;
  } catch (e) {
    console.warn("[marketplace] resolveSetupEquipoCompletoUsd:", e);
  }
  return FALLBACK_USD;
}

/**
 * Resuelve precio USD del setup de compra hashrate (fracción 25/50/75 %) — S03 o nombre.
 * Placeholders `?` — el adaptador PG los convierte a $1, $2, …
 */
export async function resolveSetupCompraHashrateUsd(): Promise<number> {
  try {
    const sqlS03 = `SELECT precio_usd FROM setups WHERE UPPER(TRIM(COALESCE(codigo, ''))) = ? LIMIT 1`;
    const rowS03 = (await db.prepare(sqlS03).get(CODIGO_HASHRATE_SHARE)) as { precio_usd?: unknown } | undefined;
    const u1 = rowS03 != null ? normalizeUsd(rowS03.precio_usd) : null;
    if (u1 != null) return u1;

    const sqlName = `SELECT precio_usd FROM setups WHERE LOWER(TRIM(nombre)) LIKE ? LIMIT 1`;
    const needle = `%${NAME_SUBSTRING}%`;
    const rowN = (await db.prepare(sqlName).get(needle)) as { precio_usd?: unknown } | undefined;
    const u2 = rowN != null ? normalizeUsd(rowN.precio_usd) : null;
    if (u2 != null) return u2;
  } catch (e) {
    console.warn("[marketplace] resolveSetupCompraHashrateUsd:", e);
  }
  return FALLBACK_USD;
}
