/**
 * Historial de precios USD en equipos_asic (`precio_historial_json`).
 * Cada entrada: precio al momento de guardar + marca de tiempo ISO.
 */

export type PrecioHistorialEntry = {
  precioUsd: number;
  /** ISO 8601 */
  actualizadoEn: string;
};

export function parsePrecioHistorialJson(raw: string | null | undefined): PrecioHistorialEntry[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: PrecioHistorialEntry[] = [];
    for (const x of j) {
      if (!x || typeof x !== "object") continue;
      const precioUsd = Number((x as { precioUsd?: unknown }).precioUsd);
      const actualizadoEn = String((x as { actualizadoEn?: unknown }).actualizadoEn ?? "").trim();
      if (!Number.isFinite(precioUsd) || precioUsd < 0 || !actualizadoEn) continue;
      out.push({ precioUsd: Math.round(precioUsd), actualizadoEn });
    }
    return out;
  } catch {
    return [];
  }
}

/** Añade una entrada solo si el precio cambia respecto al último registrado. */
export function appendPrecioHistorial(
  previous: PrecioHistorialEntry[],
  newPrecioUsd: number,
  whenIso = new Date().toISOString()
): PrecioHistorialEntry[] {
  const n = Math.round(Number(newPrecioUsd) || 0);
  if (!Number.isFinite(n) || n < 0) return [...previous];
  const last = previous[previous.length - 1];
  if (last && last.precioUsd === n) return [...previous];
  return [...previous, { precioUsd: n, actualizadoEn: whenIso }];
}

/** Primer registro al crear equipo. */
export function initialPrecioHistorialJson(precioUsd: number, whenIso = new Date().toISOString()): string {
  const n = Math.max(0, Math.round(Number(precioUsd) || 0));
  return JSON.stringify([{ precioUsd: n, actualizadoEn: whenIso }] satisfies PrecioHistorialEntry[]);
}

/** Fecha de ingreso como ISO aproximado para equipos sin historial (migración). */
export function syntheticFirstEntryFromFechaIngreso(fechaIngreso: string, precioUsd: number): PrecioHistorialEntry {
  const t = fechaIngreso.trim();
  let iso: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    iso = `${t}T12:00:00.000Z`;
  } else {
    const d = new Date(t);
    iso = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return { precioUsd: Math.max(0, Math.round(Number(precioUsd) || 0)), actualizadoEn: iso };
}
