/**
 * Precios spot + serie corta (1m) para sparklines del wire Noticias.
 * Fuente: Binance public API (sin API key).
 */

export type LiveCoinId = "bitcoin" | "dogecoin" | "litecoin" | "zcash";

export type LiveCoinQuote = {
  id: LiveCoinId;
  symbol: string;
  name: string;
  priceUsd: number;
  changePct24h: number;
  /** Cierres 1m recientes (USD) para sparkline. */
  spark: number[];
  updatedAt: string;
};

const COINS: Array<{
  id: LiveCoinId;
  symbol: string;
  name: string;
  binance: string;
}> = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", binance: "BTCUSDT" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", binance: "DOGEUSDT" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", binance: "LTCUSDT" },
  { id: "zcash", symbol: "ZEC", name: "Zcash", binance: "ZECUSDT" },
];

const UA = "Mozilla/5.0 (compatible; HashrateSGI-NewsBot/1.0; +https://hashrate.space)";

let cache: { at: number; data: LiveCoinQuote[] } | null = null;
const CACHE_MS = 2_500;

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
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

async function quoteOne(coin: (typeof COINS)[number]): Promise<LiveCoinQuote> {
  const [tickerRaw, klinesRaw] = await Promise.all([
    fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${coin.binance}`),
    fetchJson(`https://api.binance.com/api/v3/klines?symbol=${coin.binance}&interval=1m&limit=36`),
  ]);

  const ticker = tickerRaw as { lastPrice?: string; priceChangePercent?: string };
  const priceUsd = Number(ticker.lastPrice ?? 0);
  const changePct24h = Number(ticker.priceChangePercent ?? 0);

  const spark: number[] = [];
  if (Array.isArray(klinesRaw)) {
    for (const row of klinesRaw) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const close = Number(row[4]);
      if (Number.isFinite(close) && close > 0) spark.push(close);
    }
  }
  if (spark.length === 0 && priceUsd > 0) spark.push(priceUsd);

  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    priceUsd,
    changePct24h,
    spark,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchLiveCoinQuotes(force = false): Promise<LiveCoinQuote[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }
  const data = await Promise.all(COINS.map((c) => quoteOne(c)));
  cache = { at: Date.now(), data };
  return data;
}
