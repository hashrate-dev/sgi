/** Opacidad de barras que no coinciden con el mes del filtro (0–1). */
const DEFAULT_DIMMED_OPACITY = 0.32;

/**
 * Índice de columna del gráfico (0 = enero … 11 = diciembre) para `YYYY-MM`,
 * si coincide con `chartYear`; si no hay mes filtrado o no aplica → null.
 */
export function chartMonthDataIndex(mesYm: string | null | undefined, chartYear: number): number | null {
  if (mesYm == null || mesYm === "") return null;
  const t = mesYm.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  if (Number.parseInt(t.slice(0, 4), 10) !== chartYear) return null;
  const m = Number.parseInt(t.slice(5, 7), 10);
  if (m < 1 || m > 12) return null;
  return m - 1;
}

/** Opacidad de relleno para la barra `dataIndex` según mes resaltado. */
export function barFillOpacityForMonthFilter(
  dataIndex: number,
  highlightMonthIndex: number | null,
  dimmedOpacity: number = DEFAULT_DIMMED_OPACITY
): number {
  if (highlightMonthIndex == null) return 1;
  return dataIndex === highlightMonthIndex ? 1 : dimmedOpacity;
}

/** Convierte `#RRGGBB` en `rgba(..., a)` para aplicar opacidad a degradados. */
export function withAlphaHex(hex: string, alpha: number): string {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return hex;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}
