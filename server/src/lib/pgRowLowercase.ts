/**
 * PostgreSQL devuelve nombres de columnas en minúsculas; por si acaso normalizamos claves
 * para que el mapeo a vitrina (marca_equipo, etc.) sea estable en SQLite y PG.
 */
export function rowKeysToLowercase<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase()] = v;
  }
  return out as T;
}
