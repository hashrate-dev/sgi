/**
 * Bot de captura de noticias cripto vía RSS (Google News + wires públicos).
 * Sin API keys de terceros: agrega al historial SGI con dedupe por URL.
 */

export type CryptoNoticiaTopic =
  | "bitcoin"
  | "dogecoin"
  | "litecoin"
  | "zcash"
  | "cripto"
  | "inversion"
  | "gobierno_usa"
  | "uruguay"
  | "usa";

export type CryptoNoticiaDraft = {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  topics: CryptoNoticiaTopic[];
  publishedAt: string;
};

type FeedDef = {
  id: string;
  name: string;
  topics: CryptoNoticiaTopic[];
  url: string;
};

const UA =
  "Mozilla/5.0 (compatible; HashrateSGI-NewsBot/1.0; +https://hashrate.space; crypto-desk)";

function gnews(q: string, locale: "en-US" | "es-UY"): string {
  if (locale === "es-UY") {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=UY&ceid=UY:es`;
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

/** Fuentes del bot (consultas temáticas + wire CoinDesk). */
export const CRYPTO_NOTICIAS_FEEDS: readonly FeedDef[] = [
  { id: "btc", name: "Google News — Bitcoin / BTC", topics: ["bitcoin", "cripto"], url: gnews("Bitcoin OR BTC", "en-US") },
  { id: "doge", name: "Google News — Dogecoin / DOGE", topics: ["dogecoin", "cripto"], url: gnews("Dogecoin OR DOGE", "en-US") },
  { id: "ltc", name: "Google News — Litecoin / LTC", topics: ["litecoin", "cripto"], url: gnews("Litecoin OR LTC", "en-US") },
  { id: "zec", name: "Google News — Zcash / ZEC", topics: ["zcash", "cripto"], url: gnews("Zcash OR ZEC", "en-US") },
  {
    id: "invest",
    name: "Google News — Inversiones cripto / ETF",
    topics: ["inversion", "cripto"],
    url: gnews("cryptocurrency investment OR bitcoin ETF OR crypto market", "en-US"),
  },
  {
    id: "usgov",
    name: "Google News — Gobierno USA / SEC / crypto",
    topics: ["gobierno_usa", "usa", "cripto"],
    url: gnews("US government cryptocurrency OR SEC bitcoin OR White House crypto", "en-US"),
  },
  {
    id: "usa",
    name: "Google News — Cripto en USA / regulación",
    topics: ["usa", "cripto"],
    url: gnews("crypto regulation USA OR bitcoin United States", "en-US"),
  },
  {
    id: "uy",
    name: "Google News — Cripto en Uruguay",
    topics: ["uruguay", "cripto"],
    url: gnews("criptomonedas Uruguay OR bitcoin Uruguay OR crypto Uruguay", "es-UY"),
  },
  {
    id: "coindesk",
    name: "CoinDesk (RSS)",
    topics: ["cripto", "bitcoin"],
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
  },
];

export type HarvestFeed = {
  id: string;
  topics: CryptoNoticiaTopic[];
  url: string;
};
export const CRYPTO_TOPIC_LABELS: Record<CryptoNoticiaTopic, string> = {
  bitcoin: "Bitcoin",
  dogecoin: "Dogecoin",
  litecoin: "Litecoin",
  zcash: "Zcash",
  cripto: "Cripto",
  inversion: "Inversiones",
  gobierno_usa: "Gobierno USA",
  uruguay: "Cripto Uruguay",
  usa: "Cripto USA",
};

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1] ?? "") : "";
}

function tagAttr(xml: string, name: string, attr: string): string {
  const re = new RegExp(`<${name}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? decodeEntities(m[1] ?? "") : "";
}

function extractItems(xml: string): string[] {
  const out: string[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0] ?? "");
  return out;
}

function normalizeUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return u.slice(0, 2000);
  }
}

function toIsoDate(raw: string): string {
  const t = Date.parse(raw);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return new Date().toISOString();
}

function inferTopics(title: string, summary: string, base: CryptoNoticiaTopic[]): CryptoNoticiaTopic[] {
  const hay = `${title} ${summary}`.toLowerCase();
  const set = new Set<CryptoNoticiaTopic>(base);
  if (/\bbitcoin\b|\bbtc\b/.test(hay)) set.add("bitcoin");
  if (/\bdogecoin\b|\bdoge\b/.test(hay)) set.add("dogecoin");
  if (/\blitecoin\b|\bltc\b/.test(hay)) set.add("litecoin");
  if (/\bzcash\b|\bzec\b/.test(hay)) set.add("zcash");
  if (/\buruguay\b|\bmontevideo\b|\bbcu\b/.test(hay)) set.add("uruguay");
  if (/\bsec\b|\bwhite house\b|\bcongress\b|\bfed\b|\btreasury\b|\bgovernment\b/.test(hay)) {
    set.add("gobierno_usa");
    set.add("usa");
  }
  if (/\betf\b|\binvest\b|\binversión\b|\binversion\b|\bfund\b/.test(hay)) set.add("inversion");
  if (/\bcrypto\b|\bcripto\b|\bcryptocurrency\b/.test(hay)) set.add("cripto");
  return [...set];
}

/** Descarta spam típico de feeds (casinos, airdrops basura) para mantener el wire editorial. */
function isLowQualityNews(title: string, summary: string): boolean {
  const hay = `${title} ${summary}`.toLowerCase();
  return (
    /\bcasino(s)?\b|\bgambling\b|\bbetting\b|\bsportsbook\b|\bslot(s)?\b|\bpoker\b/.test(hay) ||
    /\bfree\s+spins\b|\bbonus\s+code\b|\bairdrop\s+claim\b|\bbuy\s+now\b/.test(hay) ||
    /\bporn\b|\bxxx\b|\bnude\b/.test(hay)
  );
}

export function parseRssFeedXml(xml: string, feedTopics: CryptoNoticiaTopic[]): CryptoNoticiaDraft[] {
  const channelTitle = tag(xml, "title");
  const items = extractItems(xml);
  const out: CryptoNoticiaDraft[] = [];
  for (const block of items) {
    const title = tag(block, "title");
    const link = normalizeUrl(tag(block, "link") || tagAttr(block, "link", "href"));
    if (!title || !link) continue;
    const summary = tag(block, "description").slice(0, 600);
    if (isLowQualityNews(title, summary)) continue;
    const pub = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const sourceName = tag(block, "source") || channelTitle || "Wire";
    out.push({
      title: title.slice(0, 400),
      summary,
      url: link.slice(0, 2000),
      sourceName: sourceName.slice(0, 160),
      topics: inferTopics(title, summary, feedTopics),
      publishedAt: toIsoDate(pub),
    });
  }
  return out;
}

export async function fetchFeedXml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function harvestCryptoNoticiasDrafts(
  feeds: readonly HarvestFeed[] = CRYPTO_NOTICIAS_FEEDS
): Promise<{
  drafts: CryptoNoticiaDraft[];
  feedErrors: Array<{ feedId: string; message: string }>;
}> {
  const byUrl = new Map<string, CryptoNoticiaDraft>();
  const feedErrors: Array<{ feedId: string; message: string }> = [];
  const active = feeds.filter((f) => f.url.trim() && f.id.trim());

  await Promise.all(
    active.map(async (feed) => {
      try {
        const xml = await fetchFeedXml(feed.url);
        const items = parseRssFeedXml(xml, [...feed.topics]);
        for (const item of items) {
          const prev = byUrl.get(item.url);
          if (!prev) {
            byUrl.set(item.url, item);
            continue;
          }
          const topics = new Set([...prev.topics, ...item.topics]);
          byUrl.set(item.url, { ...prev, topics: [...topics] });
        }
      } catch (e) {
        feedErrors.push({
          feedId: feed.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );

  const drafts = [...byUrl.values()].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return { drafts, feedErrors };
}
