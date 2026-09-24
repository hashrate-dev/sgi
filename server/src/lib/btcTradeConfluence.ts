/**
 * Confluencia operativa: régimen (EMA200 + Supertrend + Ichimoku) + gatillos (MACD, PSAR, EMA 25/50)
 * + filtros (RSI, Bollinger, volumen, ZigZag). Señal de escritorio, no es consejo de inversión.
 */

export type TradeBias = "buy" | "sell" | "wait";

export type TradeCheck = {
  id: string;
  label: string;
  bias: TradeBias;
  detail: string;
};

export type TradeConfluence = {
  symbol: string;
  interval: string;
  price: number;
  bias: TradeBias;
  confidence: number;
  buyVotes: number;
  sellVotes: number;
  waitVotes: number;
  thesis: string;
  action: string;
  invalidation: number;
  stop: number;
  target1: number;
  target2: number;
  riskUsd: number;
  reward1Usd: number;
  rr1: number;
  checks: TradeCheck[];
  ema25: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  supertrend: number;
  supertrendDir: 1 | -1;
  psar: number;
  psarDir: 1 | -1;
  zigzagLast: { kind: "high" | "low"; price: number };
  ichiCloud?: "above" | "inside" | "below";
  ichiTenkan?: number;
  ichiKijun?: number;
  bbMid?: number;
  bbPctB?: number;
  volRatio?: number;
  guide?: string;
  rangeDayLow: number;
  rangeDayHigh: number;
  range52Low: number;
  range52High: number;
  updatedAt: string;
  candleCount: number;
};

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const UA = "Mozilla/5.0 (compatible; HashrateSGI-Desk/1.0; +https://hashrate.space)";
const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com", "https://api.binance.us"];

const SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "LTCUSDT", "DOGEUSDT", "ZECUSDT", "SOLUSDT"]);
const INTERVALS: Record<string, string> = {
  LIVE: "1s",
  "1s": "1s",
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  D: "1d",
  W: "1w",
};

const ZZ_PCT: Record<string, number> = {
  "1s": 0.0012,
  "1m": 0.006,
  "5m": 0.01,
  "15m": 0.015,
  "30m": 0.02,
  "1h": 0.025,
  "4h": 0.04,
  "1d": 0.06,
  "1w": 0.1,
};

const cache = new Map<string, { at: number; data: TradeConfluence }>();
const CACHE_MS = 8_000;

export function normalizeTradePair(raw: string): string {
  const s = raw.trim().toUpperCase().replace("BINANCE:", "").replace("/", "");
  if (SYMBOLS.has(s)) return s;
  return "BTCUSDT";
}

export function normalizeTradeInterval(raw: string): string {
  const key = String(raw || "60").trim();
  return INTERVALS[key] ?? (Object.values(INTERVALS).includes(key) ? key : "1h");
}

function lastFinite(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = arr[i];
    if (n != null && Number.isFinite(n)) return n;
  }
  return NaN;
}

function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
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

function rsiWilder(closes: number[], period = 14): number[] {
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
    const rs = g / (l as number);
    return 100 - 100 / (1 + rs);
  });
}

function trueRange(candles: Candle[]): number[] {
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

function supertrend(candles: Candle[], atrPeriod = 10, mult = 3): { line: number[]; dir: number[] } {
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

function parabolicSar(
  candles: Candle[],
  start = 0.02,
  increment = 0.02,
  maxAf = 0.2
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

function zigzagLast(closes: number[], pct: number): { kind: "high" | "low"; price: number } {
  if (closes.length < 5) return { kind: "low", price: closes[closes.length - 1] ?? 0 };
  let kind: "high" | "low" = "low";
  let pivot = closes[0]!;
  let extreme = closes[0]!;
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i]!;
    if (kind === "low") {
      if (p > extreme) extreme = p;
      if ((extreme - p) / extreme >= pct) {
        pivot = extreme;
        kind = "high";
        extreme = p;
      }
    } else {
      if (p < extreme) extreme = p;
      if ((p - extreme) / extreme >= pct) {
        pivot = extreme;
        kind = "low";
        extreme = p;
      }
    }
  }
  return { kind, price: pivot };
}

function midHL(candles: Candle[], i: number, period: number): number {
  const from = i - period + 1;
  if (from < 0) return NaN;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = from; j <= i; j++) {
    hi = Math.max(hi, candles[j]!.h);
    lo = Math.min(lo, candles[j]!.l);
  }
  return (hi + lo) / 2;
}

function ichimokuNow(candles: Candle[]): {
  tenkan: number;
  kijun: number;
  cloudTop: number;
  cloudBot: number;
  pos: "above" | "inside" | "below";
} {
  const n = candles.length - 1;
  const disp = 26;
  const tenkan = midHL(candles, n, 9);
  const kijun = midHL(candles, n, 26);
  const src = n - disp;
  const spanA = src >= 0 ? (midHL(candles, src, 9) + midHL(candles, src, 26)) / 2 : NaN;
  const spanB = src >= 0 ? midHL(candles, src, 52) : NaN;
  const cloudTop = Math.max(spanA, spanB);
  const cloudBot = Math.min(spanA, spanB);
  const price = candles[n]!.c;
  let pos: "above" | "inside" | "below" = "inside";
  if (Number.isFinite(cloudTop) && Number.isFinite(cloudBot)) {
    if (price > cloudTop) pos = "above";
    else if (price < cloudBot) pos = "below";
  }
  return { tenkan, kijun, cloudTop, cloudBot, pos };
}

function bollingerNow(closes: number[], period = 20, mult = 2): { mid: number; upper: number; lower: number; pctB: number; width: number } {
  const n = closes.length;
  if (n < period) return { mid: NaN, upper: NaN, lower: NaN, pctB: NaN, width: NaN };
  const slice = closes.slice(n - period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) * (b - mid), 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[n - 1]!;
  const span = upper - lower;
  return {
    mid,
    upper,
    lower,
    pctB: span > 0 ? (last - lower) / span : 0.5,
    width: mid > 0 ? span / mid : NaN,
  };
}

function smaLast(values: number[], period: number): number {
  if (values.length < period) return NaN;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i]!;
  return s / period;
}

function lastJerry(closes: number[]): TradeBias | "early" | "none" {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12.map((v, i) => v - (ema26[i] ?? NaN));
  const signal = ema(
    macd.map((v) => (Number.isFinite(v) ? v : 0)),
    9
  );
  const hist = macd.map((v, i) => v - (signal[i] ?? NaN));
  const from = Math.max(2, hist.length - 8);
  for (let i = hist.length - 1; i >= from; i--) {
    const h = hist[i]!;
    const p = hist[i - 1]!;
    const q = hist[i - 2]!;
    if (![h, p, q].every((x) => Number.isFinite(x))) continue;
    if (p <= 0 && h > 0) return "buy";
    if (p >= 0 && h < 0) return "sell";
    if (h < 0 && p < 0 && h > p && p <= q) return "early";
  }
  return "none";
}

async function fetchJson(url: string, timeoutMs = 9000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKlines(symbol: string, interval: string): Promise<Candle[]> {
  let last: Error | null = null;
  const limit = interval === "1s" ? 1000 : 500;
  const minN = interval === "1s" ? 220 : 200;
  for (const host of BINANCE_HOSTS) {
    try {
      const raw = await fetchJson(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (!Array.isArray(raw)) throw new Error("klines inválidas");
      const candles: Candle[] = [];
      for (const row of raw) {
        if (!Array.isArray(row) || row.length < 6) continue;
        const o = Number(row[1]);
        const h = Number(row[2]);
        const l = Number(row[3]);
        const c = Number(row[4]);
        const v = Number(row[5]);
        const t = Number(row[0]);
        if (![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) continue;
        candles.push({ t, o, h, l, c, v });
      }
      if (candles.length < minN) throw new Error("serie insuficiente");
      return candles;
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw last ?? new Error("Binance klines no disponible");
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: n >= 100 ? 2 : 4 }).format(n);
}

async function fetchRangeStats(symbol: string): Promise<{
  dayLow: number;
  dayHigh: number;
  w52Low: number;
  w52High: number;
}> {
  let dayLow = NaN;
  let dayHigh = NaN;
  let w52Low = NaN;
  let w52High = NaN;
  try {
    const raw = await fetchJson(`${BINANCE_HOSTS[0]}/api/v3/ticker/24hr?symbol=${symbol}`);
    if (raw && typeof raw === "object") {
      const o = raw as { lowPrice?: string; highPrice?: string };
      dayLow = Number(o.lowPrice);
      dayHigh = Number(o.highPrice);
    }
  } catch {
    /* fallback below */
  }
  try {
    const raw = await fetchJson(`${BINANCE_HOSTS[0]}/api/v3/klines?symbol=${symbol}&interval=1w&limit=52`);
    if (Array.isArray(raw)) {
      let lo = Infinity;
      let hi = 0;
      for (const row of raw) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const h = Number(row[2]);
        const l = Number(row[3]);
        if (Number.isFinite(l) && l > 0) lo = Math.min(lo, l);
        if (Number.isFinite(h) && h > 0) hi = Math.max(hi, h);
      }
      if (lo < Infinity && hi > 0) {
        w52Low = lo;
        w52High = hi;
      }
    }
  } catch {
    /* keep NaN */
  }
  return { dayLow, dayHigh, w52Low, w52High };
}

export async function buildTradeConfluence(symbolRaw: string, intervalRaw: string): Promise<TradeConfluence> {
  const symbol = normalizeTradePair(symbolRaw);
  const interval = normalizeTradeInterval(intervalRaw);
  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const candles = await fetchKlines(symbol, interval);
  const ranges = await fetchRangeStats(symbol);
  const closes = candles.map((c) => c.c);
  const price = closes[closes.length - 1]!;
  const ema25a = ema(closes, 25);
  const ema50a = ema(closes, 50);
  const ema200a = ema(closes, 200);
  const ema25 = lastFinite(ema25a);
  const ema50 = lastFinite(ema50a);
  const ema200 = lastFinite(ema200a);
  const ema25Prev = ema25a[ema25a.length - 4] ?? ema25;
  const rsiA = rsiWilder(closes, 14);
  const rsi = lastFinite(rsiA);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? NaN));
  const macdSignalA = ema(
    macdLine.map((v) => (Number.isFinite(v) ? v : 0)),
    9
  );
  const macd = lastFinite(macdLine);
  const macdSignal = lastFinite(macdSignalA);
  const macdHist = macd - macdSignal;
  const st = supertrend(candles, 10, 3);
  const supertrendLine = lastFinite(st.line);
  const supertrendDir = (lastFinite(st.dir) >= 0 ? 1 : -1) as 1 | -1;
  const ps = parabolicSar(candles);
  const psarLine = lastFinite(ps.line);
  const psarDir = (lastFinite(ps.dir) >= 0 ? 1 : -1) as 1 | -1;
  const zz = zigzagLast(closes, ZZ_PCT[interval] ?? 0.025);
  const ichi = ichimokuNow(candles);
  const bb = bollingerNow(closes);
  const vols = candles.map((c) => c.v);
  const volAvg = smaLast(vols, 20);
  const volNow = vols[vols.length - 1] ?? 0;
  const volRatio = volAvg > 0 ? volNow / volAvg : 1;
  const jerry = lastJerry(closes);
  const lastCandle = candles[candles.length - 1]!;
  const candleUp = lastCandle.c >= lastCandle.o;

  const checks: TradeCheck[] = [];

  checks.push({
    id: "ema200",
    label: "Régimen EMA 200",
    bias: price > ema200 ? "buy" : "sell",
    detail: price > ema200 ? `Precio sobre EMA200 (${money(ema200)}) — solo buscar largos` : `Precio bajo EMA200 (${money(ema200)}) — solo buscar cortos`,
  });
  checks.push({
    id: "supertrend",
    label: "Supertrend ×3",
    bias: supertrendDir === 1 ? "buy" : "sell",
    detail:
      supertrendDir === 1
        ? `Alcista · línea ${money(supertrendLine)} (stop largo)`
        : `Bajista · línea ${money(supertrendLine)} (stop corto)`,
  });
  let ichiBias: TradeBias = "wait";
  let ichiDetail = "Nube sin lectura";
  if (ichi.pos === "above" && ichi.tenkan >= ichi.kijun) {
    ichiBias = "buy";
    ichiDetail = `Precio sobre la nube · Tenkan ${money(ichi.tenkan)} > Kijun ${money(ichi.kijun)}`;
  } else if (ichi.pos === "below" && ichi.tenkan <= ichi.kijun) {
    ichiBias = "sell";
    ichiDetail = `Precio bajo la nube · Tenkan ${money(ichi.tenkan)} < Kijun ${money(ichi.kijun)}`;
  } else if (ichi.pos === "inside") {
    ichiDetail = "Precio dentro de la nube — mercado en equilibrio, no forzar entrada";
  } else if (ichi.pos === "above") {
    ichiBias = "buy";
    ichiDetail = "Precio sobre la nube, Tenkan/Kijun aún no alineados";
  } else {
    ichiBias = "sell";
    ichiDetail = "Precio bajo la nube, Tenkan/Kijun aún no alineados";
  }
  checks.push({ id: "ichimoku", label: "Nube de Ichimoku", bias: ichiBias, detail: ichiDetail });

  checks.push({
    id: "ema-cross",
    label: "EMA 25 vs 50",
    bias: ema25 > ema50 ? "buy" : "sell",
    detail: ema25 > ema50 ? "EMA25 sobre EMA50 — gatillo corto alcista" : "EMA25 bajo EMA50 — gatillo corto bajista",
  });
  checks.push({
    id: "ema-slope",
    label: "Pendiente EMA 25",
    bias: ema25 > ema25Prev ? "buy" : "sell",
    detail: ema25 > ema25Prev ? "EMA25 subiendo" : "EMA25 bajando",
  });
  checks.push({
    id: "psar",
    label: "Parabolic SAR",
    bias: psarDir === 1 ? "buy" : "sell",
    detail:
      psarDir === 1
        ? `Puntos debajo (${money(psarLine)}) — seguir largos`
        : `Puntos encima (${money(psarLine)}) — seguir cortos`,
  });

  const macdRaw: TradeBias =
    macd > macdSignal && macdHist > 0 ? "buy" : macd < macdSignal && macdHist < 0 ? "sell" : "wait";
  let macdBias: TradeBias = macdRaw;
  let macdDetail = `Hist ${macdHist >= 0 ? "+" : ""}${macdHist.toFixed(2)} · MACD ${macd.toFixed(2)} vs señal ${macdSignal.toFixed(2)}`;
  if (price > ema200 && macdRaw === "sell") {
    macdBias = "wait";
    macdDetail = "Cruce bajista ignorado: régimen EMA200 alcista — no cortar contra tendencia";
  } else if (price < ema200 && macdRaw === "buy") {
    macdBias = "wait";
    macdDetail = "Cruce alcista ignorado: régimen EMA200 bajista — no comprar contra tendencia";
  }
  checks.push({ id: "macd", label: "MACD 12/26/9", bias: macdBias, detail: macdDetail });

  const jerryBias: TradeBias = jerry === "buy" || jerry === "early" ? "buy" : jerry === "sell" ? "sell" : "wait";
  checks.push({
    id: "jerry",
    label: "Jerry Buy/Sell",
    bias: jerryBias,
    detail:
      jerry === "buy"
        ? "Jerry BUY reciente — histograma cruzó a positivo"
        : jerry === "early"
          ? "Jerry EARLY — histograma recortando caída, anticipo de largo"
          : jerry === "sell"
            ? "Jerry SELL reciente — histograma cruzó a negativo"
            : "Sin cruce Jerry en las últimas velas",
  });

  let rsiBias: TradeBias = "wait";
  let rsiDetail = `RSI ${rsi.toFixed(1)}`;
  if (rsi < 32) {
    rsiBias = "buy";
    rsiDetail = `RSI ${rsi.toFixed(1)} sobreventa — zona de rebote`;
  } else if (rsi > 72) {
    rsiBias = "sell";
    rsiDetail = `RSI ${rsi.toFixed(1)} sobrecompra — zona de recorte`;
  } else if (rsi >= 48 && rsi <= 68 && ema25 > ema50) {
    rsiBias = "buy";
    rsiDetail = `RSI ${rsi.toFixed(1)} sano en tendencia alcista`;
  } else if (rsi >= 32 && rsi <= 52 && ema25 < ema50) {
    rsiBias = "sell";
    rsiDetail = `RSI ${rsi.toFixed(1)} sano en tendencia bajista`;
  } else {
    rsiDetail = `RSI ${rsi.toFixed(1)} mixto — no fuerza la entrada`;
  }
  checks.push({ id: "rsi", label: "RSI 14", bias: rsiBias, detail: rsiDetail });

  const squeeze = Number.isFinite(bb.width) && bb.width < 0.012;
  let bbBias: TradeBias = "wait";
  let bbDetail = "Bollinger sin lectura";
  if (squeeze) {
    bbDetail = `Bandas comprimidas (${(bb.width * 100).toFixed(2)}%) — esperar expansión antes de entrar`;
  } else if (bb.pctB <= 0.05) {
    bbBias = "buy";
    bbDetail = `%B ${bb.pctB.toFixed(2)} en banda inferior — posible rebote`;
  } else if (bb.pctB >= 0.95) {
    bbBias = "sell";
    bbDetail = `%B ${bb.pctB.toFixed(2)} en banda superior — posible recorte`;
  } else if (price >= bb.mid) {
    bbBias = "buy";
    bbDetail = `Precio sobre media BB ${money(bb.mid)} · %B ${bb.pctB.toFixed(2)}`;
  } else {
    bbBias = "sell";
    bbDetail = `Precio bajo media BB ${money(bb.mid)} · %B ${bb.pctB.toFixed(2)}`;
  }
  checks.push({ id: "bollinger", label: "Bandas de Bollinger", bias: bbBias, detail: bbDetail });

  let volBias: TradeBias = "wait";
  let volDetail = `Volumen ${volRatio.toFixed(2)}× vs media 20`;
  if (volRatio >= 1.15) {
    volBias = candleUp ? "buy" : "sell";
    volDetail = `Volumen alto (${volRatio.toFixed(2)}×) confirma la vela ${candleUp ? "alcista" : "bajista"}`;
  } else {
    volDetail = `Volumen flojo (${volRatio.toFixed(2)}×) — no confirma el movimiento`;
  }
  checks.push({ id: "volume", label: "Volumen 20", bias: volBias, detail: volDetail });

  checks.push({
    id: "zigzag",
    label: "Swing ZigZag",
    bias: zz.kind === "low" ? "buy" : "sell",
    detail: zz.kind === "low" ? `Último swing LOW ${money(zz.price)} — sesgo de soporte` : `Último swing HIGH ${money(zz.price)} — sesgo de techo`,
  });

  const buyVotes = checks.filter((c) => c.bias === "buy").length;
  const sellVotes = checks.filter((c) => c.bias === "sell").length;
  const waitVotes = checks.filter((c) => c.bias === "wait").length;

  const regimeIds = new Set(["ema200", "supertrend", "ichimoku"]);
  const triggerIds = new Set(["ema-cross", "ema-slope", "psar", "macd", "jerry"]);
  const regimeBuy = checks.filter((c) => regimeIds.has(c.id) && c.bias === "buy").length;
  const regimeSell = checks.filter((c) => regimeIds.has(c.id) && c.bias === "sell").length;
  const trigBuy = checks.filter((c) => triggerIds.has(c.id) && c.bias === "buy").length;
  const trigSell = checks.filter((c) => triggerIds.has(c.id) && c.bias === "sell").length;

  let regime: TradeBias = "wait";
  if (regimeBuy >= 2 && regimeBuy > regimeSell) regime = "buy";
  else if (regimeSell >= 2 && regimeSell > regimeBuy) regime = "sell";

  let bias: TradeBias = "wait";
  let guide = "Esperar. No hay mayoría de régimen (EMA200 + Supertrend + Ichimoku).";
  const rsiVetoBuy = rsi > 78;
  const rsiVetoSell = rsi < 22;

  if (squeeze) {
    guide = "Bandas de Bollinger comprimidas: no operar hasta que se expandan con el régimen.";
  } else if (regime === "wait") {
    guide = `Régimen mixto (${regimeBuy} alcistas vs ${regimeSell} bajistas en EMA200/ST/nube). Quedarse fuera.`;
  } else if (regime === "buy" && rsiVetoBuy) {
    guide = `Régimen alcista pero RSI ${rsi.toFixed(1)} extremo: no perseguir. Esperar recorte a EMA25/50.`;
  } else if (regime === "sell" && rsiVetoSell) {
    guide = `Régimen bajista pero RSI ${rsi.toFixed(1)} extremo: no vender el suelo. Esperar rebote.`;
  } else if (regime === "buy" && trigBuy < 2) {
    guide = "Sesgo ALCISTA (precio sobre régimen). Esperar gatillo: cruce MACD+ o PSAR debajo o EMA25>50.";
  } else if (regime === "sell" && trigSell < 2) {
    guide = "Sesgo BAJISTA (precio bajo régimen). Esperar gatillo: cruce MACD− o PSAR arriba o EMA25<50.";
  } else if (regime === "buy") {
    bias = "buy";
    guide = "COMPRAR. Régimen alcista y gatillos alineados. Stop bajo Supertrend/ATR. No abrir cortos.";
  } else {
    bias = "sell";
    guide = "VENDER. Régimen bajista y gatillos alineados. Stop sobre Supertrend/ATR. No abrir largos.";
  }

  const decisive = checks.filter((c) => c.bias === "buy" || c.bias === "sell").length;
  const confidence =
    bias === "wait"
      ? Math.round((Math.max(regimeBuy, regimeSell) / 3) * 40)
      : Math.round(((bias === "buy" ? buyVotes : sellVotes) / Math.max(1, decisive)) * 100);

  const atrRaw = lastFinite(rma(trueRange(candles), 14));
  const atrSafe = Number.isFinite(atrRaw) && atrRaw > 0 ? atrRaw : price * 0.008;
  const buffer = atrSafe * 0.15;

  let stop = price;
  let target1 = price;
  let target2 = price;
  let invalidation = price;
  let riskUsd = 0;

  if (bias === "buy") {
    const below = Number.isFinite(supertrendLine) ? Math.min(supertrendLine, price - atrSafe) : price - atrSafe;
    stop = Math.min(below, price - Math.max(atrSafe * 0.35, price * 0.0015));
    if (!(stop > 0 && stop < price)) stop = price - atrSafe;
    riskUsd = price - stop;
    target1 = price + riskUsd * 1.8;
    target2 = price + riskUsd * 3;
    invalidation = stop - buffer;
  } else if (bias === "sell") {
    const above = Number.isFinite(supertrendLine) ? Math.max(supertrendLine, price + atrSafe) : price + atrSafe;
    stop = Math.max(above, price + Math.max(atrSafe * 0.35, price * 0.0015));
    if (!(stop > price)) stop = price + atrSafe;
    riskUsd = stop - price;
    target1 = price - riskUsd * 1.8;
    target2 = price - riskUsd * 3;
    invalidation = stop + buffer;
  }

  const drivers = checks.filter((c) => c.bias === bias && bias !== "wait").map((c) => c.detail);
  const riskPct = price > 0 && riskUsd > 0 ? (riskUsd / price) * 100 : 0;
  let stopNote = "Sin stop operativo: no hay trade.";
  if (bias === "buy") stopNote = `Invalida si cierra debajo de ${money(stop)} (Supertrend / ATR).`;
  else if (bias === "sell") stopNote = `Invalida si cierra por encima de ${money(stop)} (Supertrend / ATR).`;

  let thesis = guide;
  let action = guide;
  if (bias === "buy") {
    thesis = `${guide} ${drivers.slice(0, 2).join(" · ")}`;
    action = `Largo a mercado en ${money(price)}. Riesgo 1R = ${money(riskUsd)} (${riskPct.toFixed(2)}%). ${stopNote}`;
  } else if (bias === "sell") {
    thesis = `${guide} ${drivers.slice(0, 2).join(" · ")}`;
    action = `Corto a mercado en ${money(price)}. Riesgo 1R = ${money(riskUsd)} (${riskPct.toFixed(2)}%). ${stopNote}`;
  }

  const data: TradeConfluence = {
    symbol,
    interval,
    price,
    bias,
    confidence,
    buyVotes,
    sellVotes,
    waitVotes,
    thesis,
    action,
    invalidation,
    stop,
    target1,
    target2,
    riskUsd,
    reward1Usd: Math.abs(target1 - price),
    rr1: riskUsd > 0 ? Math.abs(target1 - price) / riskUsd : 0,
    checks,
    ema25,
    ema50,
    ema200,
    rsi,
    macd,
    macdSignal,
    macdHist,
    supertrend: supertrendLine,
    supertrendDir,
    psar: psarLine,
    psarDir,
    zigzagLast: zz,
    ichiCloud: ichi.pos,
    ichiTenkan: ichi.tenkan,
    ichiKijun: ichi.kijun,
    bbMid: bb.mid,
    bbPctB: bb.pctB,
    volRatio,
    guide,
    rangeDayLow: ranges.dayLow,
    rangeDayHigh: ranges.dayHigh,
    range52Low: ranges.w52Low,
    range52High: ranges.w52High,
    updatedAt: new Date().toISOString(),
    candleCount: candles.length,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
