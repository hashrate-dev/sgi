/**
 * Confluencia operativa BTC (EMA 25/50/200 + Supertrend + PSAR + MACD + RSI + ZigZag).
 * Señal de escritorio, no es consejo de inversión.
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
  for (const host of BINANCE_HOSTS) {
    try {
      const raw = await fetchJson(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=400`);
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
      if (candles.length < 220) throw new Error("serie insuficiente");
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

  const checks: TradeCheck[] = [];

  checks.push({
    id: "ema200",
    label: "Régimen EMA 200",
    bias: price > ema200 ? "buy" : "sell",
    detail: price > ema200 ? `Precio sobre EMA200 (${money(ema200)}) — sesgo alcista` : `Precio bajo EMA200 (${money(ema200)}) — sesgo bajista`,
  });
  checks.push({
    id: "ema-cross",
    label: "EMA 25 vs 50",
    bias: ema25 > ema50 ? "buy" : "sell",
    detail: ema25 > ema50 ? "EMA25 sobre EMA50 — momentum corto alcista" : "EMA25 bajo EMA50 — momentum corto bajista",
  });
  checks.push({
    id: "ema-slope",
    label: "Pendiente EMA 25",
    bias: ema25 > ema25Prev ? "buy" : "sell",
    detail: ema25 > ema25Prev ? "EMA25 subiendo" : "EMA25 bajando",
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
  checks.push({
    id: "psar",
    label: "Parabolic SAR",
    bias: psarDir === 1 ? "buy" : "sell",
    detail:
      psarDir === 1
        ? `Puntos debajo del precio (${money(psarLine)}) — tendencia alcista`
        : `Puntos encima del precio (${money(psarLine)}) — tendencia bajista`,
  });
  checks.push({
    id: "macd",
    label: "MACD 12/26/9",
    bias: macd > macdSignal && macdHist > 0 ? "buy" : macd < macdSignal && macdHist < 0 ? "sell" : "wait",
    detail: `Hist ${macdHist >= 0 ? "+" : ""}${macdHist.toFixed(2)} · MACD ${macd.toFixed(2)} vs señal ${macdSignal.toFixed(2)}`,
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
    rsiDetail = `RSI ${rsi.toFixed(1)} en rango sano de tendencia alcista`;
  } else if (rsi >= 32 && rsi <= 52 && ema25 < ema50) {
    rsiBias = "sell";
    rsiDetail = `RSI ${rsi.toFixed(1)} en rango sano de tendencia bajista`;
  } else {
    rsiDetail = `RSI ${rsi.toFixed(1)} mixto — no fuerza la entrada`;
  }
  checks.push({ id: "rsi", label: "RSI 14", bias: rsiBias, detail: rsiDetail });

  const zzBias: TradeBias = "wait";
  checks.push({
    id: "zigzag",
    label: "Swing ZigZag",
    bias: zzBias,
    detail: zz.kind === "low" ? `Soporte de swing ${money(zz.price)}` : `Resistencia de swing ${money(zz.price)}`,
  });

  const buyVotes = checks.filter((c) => c.bias === "buy").length;
  const sellVotes = checks.filter((c) => c.bias === "sell").length;
  const waitVotes = checks.filter((c) => c.bias === "wait").length;
  const n = checks.length;

  let bias: TradeBias = "wait";
  if (buyVotes >= 6 && buyVotes - sellVotes >= 2) bias = "buy";
  else if (sellVotes >= 6 && sellVotes - buyVotes >= 2) bias = "sell";
  else if (buyVotes >= 5 && sellVotes <= 1) bias = "buy";
  else if (sellVotes >= 5 && buyVotes <= 1) bias = "sell";

  const confidence =
    bias === "wait"
      ? 0
      : Math.round(((bias === "buy" ? buyVotes : sellVotes) / Math.max(1, n - waitVotes)) * 100);

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

  let thesis = "Sin mayoría de reglas: no hay entrada. Se opera solo con EMA200 + Supertrend + PSAR + EMA25/50 + MACD + RSI alineados.";
  let action = "Quedarse fuera. No hay stop ni targets activos.";
  if (bias === "buy") {
    thesis = drivers.join(" · ");
    action = `Largo a mercado en ${money(price)}. Riesgo 1R = ${money(riskUsd)} (${riskPct.toFixed(2)}%). ${stopNote}`;
  } else if (bias === "sell") {
    thesis = drivers.join(" · ");
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
