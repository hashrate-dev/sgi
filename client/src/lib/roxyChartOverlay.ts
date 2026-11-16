import { rsiWilder, zigzagPivots, ZZ_PCT, type MarketCandle } from "./mercadosChartMath";
import type { ChartDrawing } from "./mercadosDrawings";

const TF: Record<string, string> = {
  LIVE: "1s",
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

export type RoxyDivMark = {
  kind: "bull" | "bear";
  iA: number;
  iB: number;
  pA: number;
  pB: number;
  oscA: number;
  oscB: number;
};

export type RoxySignalHint = {
  symbol?: string;
  stop?: number;
  target1?: number;
  target2?: number;
  price?: number;
  bias?: "buy" | "sell" | "wait";
  invalidation?: number;
};

function zzPct(interval: string): number {
  const tf = TF[interval] || interval;
  return ZZ_PCT[tf] ?? 0.025;
}

function isHighPivot(c: MarketCandle, price: number): boolean {
  return Math.abs(price - c.h) <= Math.abs(price - c.l);
}

export function findRsiDivergence(candles: MarketCandle[], interval: string): RoxyDivMark | null {
  if (candles.length < 30) return null;
  const rsi = rsiWilder(
    candles.map((c) => c.c),
    14,
  );
  const z = zigzagPivots(candles, zzPct(interval));
  const highs: Array<{ i: number; price: number }> = [];
  const lows: Array<{ i: number; price: number }> = [];
  for (const p of z) {
    const c = candles[p.i];
    if (!c) continue;
    if (isHighPivot(c, p.price)) highs.push(p);
    else lows.push(p);
  }
  const lastH = highs.slice(-2);
  const lastL = lows.slice(-2);
  if (lastL.length === 2) {
    const a = lastL[0]!;
    const b = lastL[1]!;
    const ra = rsi[a.i];
    const rb = rsi[b.i];
    if (Number.isFinite(ra) && Number.isFinite(rb) && b.price < a.price && (rb as number) > (ra as number) + 1.2) {
      return { kind: "bull", iA: a.i, iB: b.i, pA: a.price, pB: b.price, oscA: ra as number, oscB: rb as number };
    }
  }
  if (lastH.length === 2) {
    const a = lastH[0]!;
    const b = lastH[1]!;
    const ra = rsi[a.i];
    const rb = rsi[b.i];
    if (Number.isFinite(ra) && Number.isFinite(rb) && b.price > a.price && (rb as number) < (ra as number) - 1.2) {
      return { kind: "bear", iA: a.i, iB: b.i, pA: a.price, pB: b.price, oscA: ra as number, oscB: rb as number };
    }
  }
  return null;
}

function mk(
  kind: ChartDrawing["kind"],
  a: { t: number; p: number },
  b: { t: number; p: number },
  color: string,
  extra?: Partial<ChartDrawing>,
): ChartDrawing {
  return {
    id: `roxy-${kind}-${a.t}-${b.t}-${a.p.toFixed(2)}`,
    kind,
    a,
    b,
    color,
    width: extra?.width ?? 1.45,
    dash: extra?.dash,
    pts: extra?.pts,
  };
}

/** Dibujos que Roxy usa para decidir: Fib, tendencia, divergencia, stop y objetivos. */
export function buildRoxyChartDrawings(
  candles: MarketCandle[],
  interval: string,
  signal?: RoxySignalHint | null,
  binance?: string,
): { drawings: ChartDrawing[]; div: RoxyDivMark | null } {
  if (candles.length < 8) return { drawings: [], div: null };
  const last = candles[candles.length - 1]!;
  const z = zigzagPivots(candles, zzPct(interval));
  const drawings: ChartDrawing[] = [];
  if (z.length >= 2) {
    const a = z[z.length - 2]!;
    const b = z[z.length - 1]!;
    const ca = candles[a.i]!;
    const cb = candles[b.i]!;
    drawings.push(mk("fib", { t: ca.t, p: a.price }, { t: cb.t, p: b.price }, "#FF6D00", { width: 1.25 }));
    drawings.push(mk("trend", { t: ca.t, p: a.price }, { t: cb.t, p: b.price }, "#ab47bc", { width: 1.7 }));
    drawings.push(
      mk("ruler", { t: ca.t, p: a.price }, { t: last.t, p: last.c }, "#26C6DA", { dash: "dash", width: 1.15 }),
    );
    if (z.length >= 3) {
      const c0 = z[z.length - 3]!;
      const cc = candles[c0.i]!;
      drawings.push(
        mk("ray", { t: cc.t, p: c0.price }, { t: cb.t, p: b.price }, "#ce93d8", { dash: "dot", width: 1.2 }),
      );
    }
  }
  const div = findRsiDivergence(candles, interval);
  if (div) {
    const ca = candles[div.iA]!;
    const cb = candles[div.iB]!;
    drawings.push(
      mk(
        "trend",
        { t: ca.t, p: div.pA },
        { t: cb.t, p: div.pB },
        div.kind === "bull" ? "#26a69a" : "#ef5350",
        { dash: "dash", width: 1.8 },
      ),
    );
  }
  const pair = String(binance || "").replace("BINANCE:", "").toUpperCase();
  const sigPair = String(signal?.symbol || "").toUpperCase();
  const same = !sigPair || !pair || sigPair === pair;
  if (same && signal) {
    const t0 = candles[Math.max(0, candles.length - 36)]?.t ?? last.t;
    if (Number.isFinite(signal.price) && (signal.price as number) > 0) {
      drawings.push(mk("hline", { t: last.t, p: signal.price as number }, { t: last.t, p: signal.price as number }, "#ffffff", { dash: "dot", width: 1 }));
    }
    if (Number.isFinite(signal.stop) && (signal.stop as number) > 0) {
      drawings.push(mk("hline", { t: last.t, p: signal.stop as number }, { t: last.t, p: signal.stop as number }, "#ef5350", { width: 1.5 }));
    }
    if (Number.isFinite(signal.target1) && (signal.target1 as number) > 0) {
      drawings.push(mk("hline", { t: last.t, p: signal.target1 as number }, { t: last.t, p: signal.target1 as number }, "#26a69a", { dash: "dash" }));
    }
    if (Number.isFinite(signal.target2) && (signal.target2 as number) > 0) {
      drawings.push(mk("hline", { t: last.t, p: signal.target2 as number }, { t: last.t, p: signal.target2 as number }, "#26C6DA", { dash: "dash" }));
    }
    if (
      signal.bias &&
      signal.bias !== "wait" &&
      Number.isFinite(signal.price) &&
      Number.isFinite(signal.stop) &&
      (signal.stop as number) > 0
    ) {
      drawings.push(
        mk(
          "rect",
          { t: t0, p: signal.price as number },
          { t: last.t, p: signal.stop as number },
          "#ef5350",
        ),
      );
    }
  }
  return { drawings: drawings.slice(0, 14), div };
}
