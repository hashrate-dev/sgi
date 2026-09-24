export type MarketCandle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type JerryKind = "early" | "buy" | "sell";
export type JerryMark = { i: number; kind: JerryKind; price: number };

export function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) continue;
    if (!Number.isFinite(prev)) {
      acc += v;
      n += 1;
      if (n === period) {
        prev = acc / period;
        out[i] = prev;
      }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function rma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

export function rsiWilder(closes: number[], period = 14): number[] {
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gains.push(Math.max(0, d));
    losses.push(Math.max(0, -d));
  }
  const avgG = rma(gains, period);
  const avgL = rma(losses, period);
  return avgG.map((g, i) => {
    const l = avgL[i];
    if (!Number.isFinite(g) || !Number.isFinite(l)) return NaN;
    if ((l ?? 0) === 0) return 100;
    return 100 - 100 / (1 + g / (l as number));
  });
}

function trueRange(candles: MarketCandle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      out.push(c.h - c.l);
      continue;
    }
    const prev = candles[i - 1]!.c;
    out.push(Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev)));
  }
  return out;
}

export function supertrend(candles: MarketCandle[], atrPeriod = 10, mult = 3): { line: number[]; dir: number[] } {
  const atr = rma(trueRange(candles), atrPeriod);
  const line = new Array<number>(candles.length).fill(NaN);
  const dir = new Array<number>(candles.length).fill(1);
  let prevUp = NaN;
  let prevDn = NaN;
  let trend = 1;
  for (let i = 0; i < candles.length; i++) {
    const a = atr[i];
    if (!Number.isFinite(a)) continue;
    const hl2 = (candles[i]!.h + candles[i]!.l) / 2;
    let up = hl2 - mult * (a as number);
    let dn = hl2 + mult * (a as number);
    if (Number.isFinite(prevUp)) up = candles[i]!.c > prevUp ? Math.max(up, prevUp) : up;
    if (Number.isFinite(prevDn)) dn = candles[i]!.c < prevDn ? Math.min(dn, prevDn) : dn;
    if (Number.isFinite(prevDn) && candles[i]!.c > prevDn) trend = 1;
    else if (Number.isFinite(prevUp) && candles[i]!.c < prevUp) trend = -1;
    dir[i] = trend;
    line[i] = trend === 1 ? up : dn;
    prevUp = up;
    prevDn = dn;
  }
  return { line, dir };
}

export function parabolicSar(
  candles: MarketCandle[],
  start = 0.02,
  increment = 0.02,
  maxAf = 0.2,
): { line: number[]; dir: number[] } {
  const n = candles.length;
  const line = new Array<number>(n).fill(NaN);
  const dir = new Array<number>(n).fill(1);
  if (n < 2) return { line, dir };

  let up = candles[1]!.c >= candles[0]!.c;
  let af = start;
  let ep = up ? Math.max(candles[0]!.h, candles[1]!.h) : Math.min(candles[0]!.l, candles[1]!.l);
  let sar = up ? candles[0]!.l : candles[0]!.h;
  line[0] = sar;
  dir[0] = up ? 1 : -1;

  for (let i = 1; i < n; i++) {
    const prev = candles[i - 1]!;
    const cur = candles[i]!;
    let next = sar + af * (ep - sar);
    if (up) {
      const floor = i >= 2 ? Math.min(prev.l, candles[i - 2]!.l) : prev.l;
      next = Math.min(next, floor);
      if (cur.l < next) {
        up = false;
        next = ep;
        ep = cur.l;
        af = start;
      } else if (cur.h > ep) {
        ep = cur.h;
        af = Math.min(maxAf, af + increment);
      }
    } else {
      const ceil = i >= 2 ? Math.max(prev.h, candles[i - 2]!.h) : prev.h;
      next = Math.max(next, ceil);
      if (cur.h > next) {
        up = true;
        next = ep;
        ep = cur.h;
        af = start;
      } else if (cur.l < ep) {
        ep = cur.l;
        af = Math.min(maxAf, af + increment);
      }
    }
    sar = next;
    line[i] = sar;
    dir[i] = up ? 1 : -1;
  }
  return { line, dir };
}

export function zigzagPivots(candles: MarketCandle[], pct: number): Array<{ i: number; price: number }> {
  if (candles.length < 3) return [];
  const pts: Array<{ i: number; price: number }> = [];
  let dir: 1 | -1 = 1;
  let extI = 0;
  let ext = candles[0]!.h;
  pts.push({ i: 0, price: candles[0]!.l });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    if (dir === 1) {
      if (c.h >= ext) {
        ext = c.h;
        extI = i;
      }
      if ((ext - c.l) / ext >= pct) {
        pts.push({ i: extI, price: ext });
        dir = -1;
        ext = c.l;
        extI = i;
      }
    } else {
      if (c.l <= ext) {
        ext = c.l;
        extI = i;
      }
      if ((c.h - ext) / ext >= pct) {
        pts.push({ i: extI, price: ext });
        dir = 1;
        ext = c.h;
        extI = i;
      }
    }
  }
  pts.push({ i: extI, price: ext });
  return pts;
}

export function jerryMarks(closes: number[], lows: number[], highs: number[]): JerryMark[] {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = ema12.map((v, i) => v - (ema26[i] ?? NaN));
  const signal = emaSeries(
    macd.map((v) => (Number.isFinite(v) ? v : 0)),
    9,
  );
  const hist = macd.map((v, i) => v - (signal[i] ?? NaN));
  const out: JerryMark[] = [];
  for (let i = 2; i < hist.length; i++) {
    const h = hist[i]!;
    const p = hist[i - 1]!;
    const q = hist[i - 2]!;
    if (![h, p, q].every((x) => Number.isFinite(x))) continue;
    if (p <= 0 && h > 0) out.push({ i, kind: "buy", price: lows[i]! });
    else if (p >= 0 && h < 0) out.push({ i, kind: "sell", price: highs[i]! });
    else if (h < 0 && p < 0 && h > p && p <= q) out.push({ i, kind: "early", price: lows[i]! });
  }
  return out;
}

export function macdSeries(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macd = ema12.map((v, i) => v - (ema26[i] ?? NaN));
  const signal = emaSeries(
    macd.map((v) => (Number.isFinite(v) ? v : 0)),
    9,
  );
  const hist = macd.map((v, i) => v - (signal[i] ?? NaN));
  return { macd, signal, hist };
}

export const ZZ_PCT: Record<string, number> = {
  "1s": 0.0012,
  "1m": 0.006,
  "5m": 0.01,
  "15m": 0.015,
  "30m": 0.02,
  "1h": 0.025,
  "4h": 0.04,
  "1d": 0.06,
};
