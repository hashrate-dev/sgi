/**
 * Precios spot + serie corta para sparklines del wire Noticias.
 * Binance a menudo bloquea IPs de Vercel (451/403); hay fallbacks.
 */

export type LiveCoinId = "bitcoin" | "dogecoin" | "litecoin" | "zcash";

export type LiveCoinQuote = {
  id: LiveCoinId;
  symbol: string;
  name: string;
  priceUsd: number;
  changePct24h: number;
  /** Cierres recientes (USD) para sparkline. */
  spark: number[];
  updatedAt: string;
};

const COINS: Array<{
  id: LiveCoinId;
  symbol: string;
  name: string;
  binance: string;
  gecko: string;
  kraken: string;
}> = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", binance: "BTCUSDT", gecko: "bitcoin", kraken: "XBTUSD" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", binance: "DOGEUSDT", gecko: "dogecoin", kraken: "XDGUSD" },
  { id: "litecoin", symbol: "LTC", name: "Litecoin", binance: "LTCUSDT", gecko: "litecoin", kraken: "LTCUSD" },
  { id: "zcash", symbol: "ZEC", name: "Zcash", binance: "ZECUSDT", gecko: "zcash", kraken: "ZECUSD" },
];

const UA = "Mozilla/5.0 (compatible; HashrateSGI-NewsBot/1.0; +https://hashrate.space)";

let cache: { at: number; data: LiveCoinQuote[] } | null = null;
const CACHE_MS = 3_000;

async function fetchJson(url: string, timeoutMs = 8_000): Promise<unknown> {
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

const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com", "https://api.binance.us"];

async function fetchBinanceJson(path: string): Promise<unknown> {
  let last: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      return await fetchJson(`${host}${path}`);
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw last ?? new Error("Binance no disponible");
}

function emptyQuote(coin: (typeof COINS)[number]): LiveCoinQuote {
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    priceUsd: 0,
    changePct24h: 0,
    spark: [],
    updatedAt: new Date().toISOString(),
  };
}

async function fromBinance(): Promise<LiveCoinQuote[] | null> {
  try {
    const symbols = encodeURIComponent(JSON.stringify(COINS.map((c) => c.binance)));
    const tickerRaw = await fetchBinanceJson(`/api/v3/ticker/24hr?symbols=${symbols}`);
    if (!Array.isArray(tickerRaw)) return null;
    const bySym = new Map<string, { lastPrice?: string; priceChangePercent?: string }>();
    for (const row of tickerRaw) {
      if (!row || typeof row !== "object") continue;
      const o = row as { symbol?: string; lastPrice?: string; priceChangePercent?: string };
      if (o.symbol) bySym.set(o.symbol, o);
    }

    const sparks = await Promise.all(
      COINS.map(async (coin) => {
        try {
          const klinesRaw = await fetchBinanceJson(`/api/v3/klines?symbol=${coin.binance}&interval=1m&limit=36`);
          const spark: number[] = [];
          if (Array.isArray(klinesRaw)) {
            for (const row of klinesRaw) {
              if (!Array.isArray(row) || row.length < 5) continue;
              const close = Number(row[4]);
              if (Number.isFinite(close) && close > 0) spark.push(close);
            }
          }
          return spark;
        } catch {
          return [] as number[];
        }
      })
    );

    return COINS.map((coin, i) => {
      const t = bySym.get(coin.binance);
      const priceUsd = Number(t?.lastPrice ?? 0);
      const spark = sparks[i] ?? [];
      if ((!Number.isFinite(priceUsd) || priceUsd <= 0) && spark.length === 0) return emptyQuote(coin);
      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        priceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : spark[spark.length - 1] ?? 0,
        changePct24h: Number(t?.priceChangePercent ?? 0) || 0,
        spark: spark.length ? spark : priceUsd > 0 ? [priceUsd] : [],
        updatedAt: new Date().toISOString(),
      };
    });
  } catch {
    return null;
  }
}

async function fromCoinGecko(): Promise<LiveCoinQuote[] | null> {
  try {
    const ids = COINS.map((c) => c.gecko).join(",");
    const priceRaw = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!priceRaw || typeof priceRaw !== "object") return null;
    const bag = priceRaw as Record<string, { usd?: number; usd_24h_change?: number }>;

    const sparks = await Promise.all(
      COINS.map(async (coin) => {
        try {
          const chart = await fetchJson(
            `https://api.coingecko.com/api/v3/coins/${coin.gecko}/market_chart?vs_currency=usd&days=1&interval=minutely`
          );
          const prices = (chart as { prices?: [number, number][] })?.prices;
          if (!Array.isArray(prices)) return [] as number[];
          const spark: number[] = [];
          const step = Math.max(1, Math.floor(prices.length / 36));
          for (let i = 0; i < prices.length; i += step) {
            const n = Number(prices[i]?.[1]);
            if (Number.isFinite(n) && n > 0) spark.push(n);
          }
          return spark.slice(-36);
        } catch {
          return [] as number[];
        }
      })
    );

    return COINS.map((coin, i) => {
      const p = bag[coin.gecko];
      const priceUsd = Number(p?.usd ?? 0);
      const spark = sparks[i] ?? [];
      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        priceUsd: Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : spark[spark.length - 1] ?? 0,
        changePct24h: Number(p?.usd_24h_change ?? 0) || 0,
        spark: spark.length ? spark : priceUsd > 0 ? [priceUsd] : [],
        updatedAt: new Date().toISOString(),
      };
    });
  } catch {
    return null;
  }
}

async function fromKraken(): Promise<LiveCoinQuote[] | null> {
  try {
    const pair = COINS.map((c) => c.kraken).join(",");
    const raw = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
    const result = (raw as { result?: Record<string, { c?: string[]; p?: string[]; o?: string }> })?.result;
    if (!result) return null;

    const pick = (want: string): { price: number; open: number } => {
      for (const [k, v] of Object.entries(result)) {
        if (k === want || k.includes(want.replace("USD", "")) || k.endsWith(want)) {
          const price = Number(v.c?.[0] ?? 0);
          const open = Number(v.o ?? 0);
          return { price, open };
        }
      }
      return { price: 0, open: 0 };
    };

    return COINS.map((coin) => {
      const { price, open } = pick(coin.kraken);
      const changePct24h = open > 0 && price > 0 ? ((price - open) / open) * 100 : 0;
      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        priceUsd: price,
        changePct24h,
        spark: price > 0 ? [price] : [],
        updatedAt: new Date().toISOString(),
      };
    });
  } catch {
    return null;
  }
}

function usable(data: LiveCoinQuote[] | null): boolean {
  return Boolean(data && data.some((c) => c.priceUsd > 0));
}

export async function fetchLiveCoinQuotes(force = false): Promise<LiveCoinQuote[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }
  let data = await fromBinance();
  if (!usable(data)) data = await fromCoinGecko();
  if (!usable(data)) data = await fromKraken();
  if (!usable(data)) data = COINS.map(emptyQuote);
  cache = { at: Date.now(), data: data! };
  return data!;
}
