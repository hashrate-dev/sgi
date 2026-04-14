/**
 * Códigos de producto (`numero_serie` en vitrina): M + familia + hashrate entero.
 * Ej.: S21 200 TH/s → MS21200 · L7 9.500 MH/s → ML79500 · Z15 840 kSol/s → MZ15840
 * Solo aplica cuando el equipo está marcado para marketplace.
 */

/** Antminer L9 / L7 / S21 / Z15 a partir del texto de modelo */
export function modelSlugVitrina(modelo: string): "S21" | "L7" | "L9" | "Z15" | null {
  const m = modelo.trim().toLowerCase();
  if (/\bl9\b/.test(m)) return "L9";
  if (/\bl7\b/.test(m)) return "L7";
  if (/\bz15\b/.test(m)) return "Z15";
  if (/\bs21\b/.test(m)) return "S21";
  return null;
}

/**
 * Obtiene el entero de hashrate desde el texto de procesador (TH/s, MH/s o kSol/s).
 * Acepta formatos tipo "200 TH/s", "15.000 MH/s", "840 kSol/s" (punto como miles).
 */
export function extractHashrateIntegerFromProcesador(procesador: string): number | null {
  const raw = procesador.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const ksolMatch = lower.match(/^([\d.,]+)\s*ksol/);
  if (ksolMatch?.[1]) {
    const compact = ksolMatch[1].replace(/\./g, "").replace(/,/g, "");
    const n = parseInt(compact, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }
  const unitMatch = lower.match(/\s*(th\/s|ths|\bth\b|mh\/s|mhs|\bmh\b)/);
  const numSection = unitMatch && unitMatch.index != null ? raw.slice(0, unitMatch.index).trim() : raw.split(/\s+/)[0] ?? raw;
  if (!numSection) return null;
  // Miles con punto (15.000, 9.050, 8.800) → quitar puntos
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
