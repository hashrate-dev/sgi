/**
 * Misma semántica que el listado «Tienda online» en Gestión ASIC (`marketplaceVisible` / `mp_visible`).
 * Sirve para filtrar la vitrina pública aunque el WHERE SQL falle por tipos raros en la columna.
 */
export function mpVisibleFromDbValue(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return false;
  return Number(v) === 1;
}
