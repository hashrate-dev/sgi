import { db } from "../db.js";
import { hydrateRoxyFacts, hydrateRoxySaid, ingestNewsFacts, type RoxyNewsHit } from "./roxyMind.js";

const COINS: Array<{ symbol: string; topic?: string; re: RegExp }> = [
  { symbol: "BTCUSDT", topic: "bitcoin", re: /bitcoin|\bbtc\b/i },
  { symbol: "ETHUSDT", re: /ethereum|\beth\b/i },
  { symbol: "SOLUSDT", re: /solana|\bsol\b/i },
  { symbol: "LTCUSDT", topic: "litecoin", re: /litecoin|\bltc\b/i },
  { symbol: "DOGEUSDT", topic: "dogecoin", re: /dogecoin|\bdoge\b/i },
  { symbol: "ZECUSDT", topic: "zcash", re: /zcash|\bzec\b/i },
];

function stripHtml(s: string): string {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTopics(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).toLowerCase());
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase());
  } catch {
    /* */
  }
  return [];
}

function coinOf(title: string, topics: string[]): string {
  for (const c of COINS) {
    if (c.topic && topics.includes(c.topic)) return c.symbol;
  }
  const hay = `${title} ${topics.join(" ")}`;
  for (const c of COINS) {
    if (c.re.test(hay)) return c.symbol;
  }
  return "";
}

function wantedSet(symbols: string[]): Set<string> {
  return new Set(symbols.filter(Boolean));
}

/** Lee el mismo historial que la sección Noticias del SGI (`sgi_crypto_noticias`). */
export async function readSgiCryptoNews(symbols: string[], limit = 24): Promise<RoxyNewsHit[]> {
  const want = wantedSet(symbols);
  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = (await db
      .prepare(
        `SELECT id, title, summary, url, source_name, topics_json, published_at, title_es, summary_es
         FROM sgi_crypto_noticias
         ORDER BY published_at DESC, id DESC
         LIMIT 120`,
      )
      .all()) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }

  const out: RoxyNewsHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const url = String(row.url ?? row.URL ?? "").trim();
    if (!url || seen.has(url)) continue;
    const title = stripHtml(String(row.title_es || row.TITLE_ES || row.title || row.TITLE || ""));
    if (title.length < 12) continue;
    const topics = parseTopics(row.topics_json ?? row.TOPICS_JSON);
    const symbol = coinOf(title, topics);
    if (symbol && want.size && !want.has(symbol)) continue;
    if (!symbol && want.size && want.size <= 2) continue;
    seen.add(url);
    const published = Date.parse(String(row.published_at ?? row.PUBLISHED_AT ?? ""));
    out.push({
      url: url.slice(0, 2000),
      title: title.slice(0, 220),
      summary: stripHtml(String(row.summary_es || row.SUMMARY_ES || row.summary || row.SUMMARY || "")).slice(0, 280),
      source: stripHtml(String(row.source_name || row.SOURCE_NAME || "")).slice(0, 80),
      symbol,
      at: Number.isFinite(published) ? published : Date.now(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function rememberSgiNewsOnBook<T extends { mind?: Record<string, unknown> }>(
  book: T,
  symbols: string[],
): Promise<T> {
  const now = Date.now();
  const prev = book.mind && typeof book.mind === "object" ? book.mind : {};
  const newsAt = Number(prev.newsAt) || 0;
  const facts0 = hydrateRoxyFacts(prev.facts);
  if (now - newsAt < 18 * 60_000 && facts0.some((f) => f.kind === "news")) return book;
  const hits = await readSgiCryptoNews(symbols, 20);
  return {
    ...book,
    mind: {
      ...prev,
      said: hydrateRoxySaid(prev.said),
      facts: ingestNewsFacts(facts0, hits, now),
      newsAt: now,
    },
  };
}

