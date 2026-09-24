import type { MarketCandle } from "./mercadosChartMath";

export type ChartDrawTool =
  | "cursor"
  | "trend"
  | "hline"
  | "vline"
  | "ray"
  | "rect"
  | "fib"
  | "ruler"
  | "pencil"
  | "eraser";

export const DRAW_COLORS = ["#f5c542", "#26a69a", "#ef5350", "#26C6DA", "#ab47bc", "#ffffff", "#2962FF", "#FF6D00"];

export function hexToRgba(hex: string, a: number): string {
  const raw = hex.replace("#", "").trim();
  const n = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.slice(0, 6);
  if (n.length < 6) return `rgba(245,197,66,${a})`;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return `rgba(245,197,66,${a})`;
  return `rgba(${r},${g},${b},${a})`;
}

export type ChartPoint = { t: number; p: number };

export type ChartDrawing = {
  id: string;
  kind: Exclude<ChartDrawTool, "cursor" | "eraser">;
  a: ChartPoint;
  b: ChartPoint;
  pts?: ChartPoint[];
  color: string;
  width?: number;
  dash?: LineDash;
};

export type EmaKey = "ema25" | "ema50" | "ema200";
export type StudyLineKey = EmaKey | "bb";
export type LineDash = "solid" | "dash" | "dot";
export type EmaLineStyle = { color: string; width: number; dash: LineDash };

export const DEFAULT_EMA_STYLE: Record<EmaKey, EmaLineStyle> = {
  ema25: { color: "#F5C542", width: 1.6, dash: "solid" },
  ema50: { color: "#26C6DA", width: 1.6, dash: "solid" },
  ema200: { color: "#EF5350", width: 1.6, dash: "solid" },
};

export const DEFAULT_STUDY_STYLE: Record<StudyLineKey, EmaLineStyle> = {
  ...DEFAULT_EMA_STYLE,
  bb: { color: "#5b9cf6", width: 1.25, dash: "dash" },
};

export const EMA_LABEL: Record<EmaKey, string> = {
  ema25: "EMA 25",
  ema50: "EMA 50",
  ema200: "EMA 200",
};

export const STUDY_LINE_LABEL: Record<StudyLineKey, string> = {
  ema25: "EMA 25",
  ema50: "EMA 50",
  ema200: "EMA 200",
  bb: "Bandas de Bollinger",
};

export const DRAWING_KIND_LABEL: Record<ChartDrawing["kind"], string> = {
  trend: "Línea de tendencia",
  hline: "Línea horizontal",
  vline: "Línea vertical",
  ray: "Rayo",
  rect: "Rectángulo",
  fib: "Fibonacci",
  ruler: "Regla",
  pencil: "Lápiz",
};

export function dashArray(dash: LineDash): number[] {
  if (dash === "dash") return [8, 5];
  if (dash === "dot") return [2, 3.5];
  return [];
}

export function fracIndex(candles: MarketCandle[], t: number): number {
  if (candles.length === 0) return 0;
  if (t <= candles[0]!.t) return 0;
  const last = candles.length - 1;
  if (t >= candles[last]!.t) {
    if (last === 0) return 0;
    const dt = candles[last]!.t - candles[last - 1]!.t || 1;
    return last + (t - candles[last]!.t) / dt;
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const dt = candles[hi]!.t - candles[lo]!.t || 1;
  return lo + (t - candles[lo]!.t) / dt;
}

export function timeAtIndex(candles: MarketCandle[], i: number): number {
  if (!candles.length) return 0;
  if (i <= 0) return candles[0]!.t;
  const last = candles.length - 1;
  if (i >= last) {
    if (last === 0) return candles[0]!.t;
    const dt = candles[last]!.t - candles[last - 1]!.t || 1;
    return candles[last]!.t + (i - last) * dt;
  }
  const a = Math.floor(i);
  const f = i - a;
  const c0 = candles[a]!;
  const c1 = candles[a + 1]!;
  return c0.t + f * (c1.t - c0.t);
}

export function distToSeg(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export function distToPoly(x: number, y: number, pts: Array<{ x: number; y: number }>): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    best = Math.min(best, distToSeg(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

export const FIB_LEVELS = [
  { r: 0, label: "0" },
  { r: 0.236, label: "0.236" },
  { r: 0.382, label: "0.382" },
  { r: 0.5, label: "0.5" },
  { r: 0.618, label: "0.618" },
  { r: 0.786, label: "0.786" },
  { r: 1, label: "1" },
];
