/**
 * Formato de montos para almacenamiento en base de datos:
 * separador de miles con ., decimales con , y 2 dígitos (ej. 1.234,56).
 */

/** Formatea un número para guardar en DB: "1.234,56" o "-1.234,56" */
export function formatForDb(n: number): string {
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withDots = (intPart ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = `${withDots},${decPart ?? "00"}`;
  return n < 0 ? `-${s}` : s;
}

/** Parsea un valor guardado en DB de vuelta a número */
export function parseFromDb(s: string | number | null | undefined): number {
  if (s == null || s === "") return 0;
  if (typeof s === "number") return s;
  const trimmed = String(s).trim().replace(/\s/g, "");
  const negative = trimmed.startsWith("-");
  const clean = trimmed.replace(/^-/, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  return Number.isFinite(num) ? (negative ? -num : num) : 0;
}
