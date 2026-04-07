/**
 * Misma lógica que el servidor: vista previa del código vitrina en el formulario.
 * M + S21|L7|L9 + hashrate entero (p. ej. MS21200, ML79500, ML915000).
 */

export function modelSlugVitrina(modelo: string): "S21" | "L7" | "L9" | null {
  const m = modelo.trim().toLowerCase();
  if (/\bl9\b/.test(m)) return "L9";
  if (/\bl7\b/.test(m)) return "L7";
  if (/\bs21\b/.test(m)) return "S21";
  return null;
}

export function extractHashrateIntegerFromProcesador(procesador: string): number | null {
  const raw = procesador.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const unitMatch = lower.match(/\s*(th\/s|ths|\bth\b|mh\/s|mhs|\bmh\b)/);
  const numSection = unitMatch && unitMatch.index != null ? raw.slice(0, unitMatch.index).trim() : raw.split(/\s+/)[0] ?? raw;
  if (!numSection) return null;
  const compact = numSection.replace(/\./g, "").replace(/,/g, "");
  const n = parseInt(compact, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function codigoProductoVitrina(modelo: string, procesador: string, vitrinaVisible: boolean): string | null {
  if (!vitrinaVisible) return null;
  const slug = modelSlugVitrina(modelo);
  const n = extractHashrateIntegerFromProcesador(procesador);
  if (!slug || n == null) return null;
  return `M${slug}${n}`;
}
