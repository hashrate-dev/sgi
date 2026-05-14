/**
 * Normaliza `speedAccepted` (y campos similares) del API rigs2 de NiceHash:
 * a veces vienen como string; la velocidad útil puede no estar en `stats[0]`.
 */

export function nhParseSpeedAccepted(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 0 || raw > 1e20) return null;
    return raw;
  }
  if (typeof raw === "string") {
    const t = raw.trim().replace(/\s/g, "").replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 1e20) return null;
    return n;
  }
  return null;
}

/** Elige la fila de `stats` con mayor `speedAccepted` parseable; si no hay ninguna, usa la primera fila válida. */
export function nhPickPrimaryMiningStat(stats: unknown[] | undefined): Record<string, unknown> | null {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  let best: Record<string, unknown> | null = null;
  let bestSp = -Infinity;
  for (const st of stats) {
    if (!st || typeof st !== "object") continue;
    const o = st as Record<string, unknown>;
    const sp = nhParseSpeedAccepted(o.speedAccepted);
    if (sp == null) continue;
    if (sp > bestSp) {
      bestSp = sp;
      best = o;
    }
  }
  if (best) return best;
  const st0 = stats[0];
  return st0 && typeof st0 === "object" ? (st0 as Record<string, unknown>) : null;
}

export function nhRigSpeedAcceptedFromStats(stats: unknown[] | undefined): number | null {
  const st = nhPickPrimaryMiningStat(stats);
  if (!st) return null;
  return nhParseSpeedAccepted(st.speedAccepted);
}

/**
 * Heurística NiceHash watcher: Scrypt en ASICs BTC suele reportar valores con ≥3 cifras enteras (ej. 196 TH/s);
 * Scrypt LTC/DOGE suele quedar en 1–2 cifras enteras (ej. 10.5 MH/s). El API usa el mismo campo numérico.
 */
export function nhAcceptedSpeedLooksLikeTh(speed: number): boolean {
  if (!Number.isFinite(speed) || speed <= 0) return true;
  if (speed < 1) return false;
  const intPart = Math.floor(Math.abs(speed));
  const intDigits = Math.floor(Math.log10(intPart)) + 1;
  return intDigits >= 3;
}
