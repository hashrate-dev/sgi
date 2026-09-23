/**
 * Confluencia operativa BTC (EMA 25/50/200 + Supertrend + MACD + RSI + ZigZag).
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
  zigzagLast: { kind: "high" | "low"; price: number };
  updatedAt: string;
  candleCount: number;
};

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const UA = "Mozilla/5.0 (compatible; HashrateSGI-Desk/1.0; +https://hashrate.space)";
const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com", "https://api.binance.us"];

const SYMBOLS = new Set(["BTCUSDT", "LTCUSDT", "DOGEUSDT", "ZECUSDT"]);
const INTERVALS: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  D: "1d",
  W: "1w",
};

const ZZ_PCT: Record<string, number> = {
  "1m": 0.006,
  "5m": 0.01,
  "15m": 0.015,
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

export async function buildTradeConfluence(symbolRaw: string, intervalRaw: string): Promise<TradeConfluence> {
  const symbol = normalizeTradePair(symbolRaw);
  const interval = normalizeTradeInterval(intervalRaw);
  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const candles = await fetchKlines(symbol, interval);
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

  const zzBias: TradeBias = zz.kind === "low" ? "buy" : "sell";
  checks.push({
    id: "zigzag",
    label: "ZigZag",
    bias: zzBias,
    detail: zz.kind === "low" ? `Último swing low ${money(zz.price)}` : `Último swing high ${money(zz.price)}`,
  });

  const buyVotes = checks.filter((c) => c.bias === "buy").length;
  const sellVotes = checks.filter((c) => c.bias === "sell").length;
  const waitVotes = checks.filter((c) => c.bias === "wait").length;
  const n = checks.length;

  let bias: TradeBias = "wait";
  if (buyVotes >= 5 && buyVotes - sellVotes >= 2) bias = "buy";
  else if (sellVotes >= 5 && sellVotes - buyVotes >= 2) bias = "sell";
  else if (buyVotes >= 4 && sellVotes <= 1) bias = "buy";
  else if (sellVotes >= 4 && buyVotes <= 1) bias = "sell";

  const confidence = Math.round((Math.max(buyVotes, sellVotes) / n) * 100);

  const atrLast = lastFinite(rma(trueRange(candles), 14));
  const buffer = Number.isFinite(atrLast) ? atrLast * 0.15 : price * 0.002;
  let stop = bias === "buy" ? Math.min(supertrendLine, price - atrLast) : Math.max(supertrendLine, price + atrLast);
  if (!Number.isFinite(stop) || stop <= 0) stop = bias === "buy" ? price * 0.985 : price * 1.015;
  const riskUsd = Math.abs(price - stop);
  const target1 = bias === "buy" ? price + riskUsd * 1.8 : price - riskUsd * 1.8;
  const target2 = bias === "buy" ? price + riskUsd * 3 : price - riskUsd * 3;
  const invalidation = stop + (bias === "buy" ? -buffer : buffer);

  let thesis = "Confluencia incompleta: el book pide espera, no forzar.";
  let action = "No entrar. Esperá cruce de EMA 25/50 alineado con Supertrend y MACD.";
  if (bias === "buy") {
    thesis = `Alcista ${buyVotes}/${n}: régimen sobre EMA200, Supertrend up y momentum a favor.`;
    action = `Comprar en ${money(price)} solo si no pierde Supertrend. Stop ${money(stop)}. T1 ${money(target1)} · T2 ${money(target2)}.`;
  } else if (bias === "sell") {
    thesis = `Bajista ${sellVotes}/${n}: precio bajo EMA200 o momentum en contra.`;
    action = `Vender / no perseguir largos en ${money(price)}. Stop ${money(stop)}. T1 ${money(target1)} · T2 ${money(target2)}.`;
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
    zigzagLast: zz,
    updatedAt: new Date().toISOString(),
    candleCount: candles.length,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}
