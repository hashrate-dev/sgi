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
  imageUrl: string;
};

type FeedDef = {
  id: string;
  name: string;
  topics: CryptoNoticiaTopic[];
  url: string;
};

const UA =
  "Mozilla/5.0 (compatible; HashrateSGI-NewsBot/1.0; +https://hashrate.space; crypto-desk)";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

function normalizeImageUrl(raw: string): string {
  const u = raw.trim().replace(/^<|>$/g, "").replace(/&amp;/g, "&");
  if (!u) return "";
  if (u.startsWith("//")) return `https:${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!isAcceptableArticleImage(parsed.href)) return "";
    return parsed.toString().slice(0, 2000);
  } catch {
    return "";
  }
}

/** Rechaza logos, pixels y overlays genéricos de Google (no son la foto del artículo). */
export function isAcceptableArticleImage(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    const host = parsed.hostname.toLowerCase();
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    // Google / CDN de previews genéricas (es lo que salía repetido en todas las tarjetas)
    if (
      /(^|\.)google\./.test(host) ||
      /(^|\.)gstatic\.com$/.test(host) ||
      /(^|\.)googleusercontent\.com$/.test(host) ||
      /(^|\.)ggpht\.com$/.test(host) ||
      host === "news.google.com" ||
      host.endsWith(".news.google.com")
    ) {
      return false;
    }

    // Microlink screenshot / proxy genérico
    if (/(^|\.)microlink\.io$/.test(host) && /screenshot|card|preview/i.test(path)) {
      return false;
    }

    if (/1x1|pixel|spacer|blank\.gif|doubleclick|facebook\.com\/tr/i.test(parsed.href)) return false;
    if (/\bfavicon\b|\bapple-touch-icon\b|\bsprite\b|\blogo[-_.]?\b|\bavatar\b|\bplaceholder\b|\bdefault[-_]?(image|thumb|img)\b/i.test(path)) {
      return false;
    }
    if (/\.(svg)(?:$|\?)/i.test(path) && /logo|icon|brand/i.test(path)) return false;

    return true;
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Extrae la imagen principal del ítem RSS (enclosure / media / img en HTML). */
function extractItemImage(block: string): string {
  const enclosureUrl = tagAttr(block, "enclosure", "url");
  const enclosureType = tagAttr(block, "enclosure", "type").toLowerCase();
  if (enclosureUrl && (!enclosureType || enclosureType.startsWith("image/"))) {
    const n = normalizeImageUrl(enclosureUrl);
    if (n) return n;
  }

  const mediaContent =
    tagAttr(block, "media:content", "url") ||
    tagAttr(block, "media:thumbnail", "url") ||
    tagAttr(block, "media:thumbnail", "href");
  if (mediaContent) {
    const n = normalizeImageUrl(mediaContent);
    if (n) return n;
  }

  // Algunos feeds usan <image><url>...</url></image> por ítem
  const imageBlock = block.match(/<image\b[\s\S]*?<\/image>/i)?.[0] ?? "";
  if (imageBlock) {
    const fromImage = tag(imageBlock, "url") || tagAttr(imageBlock, "url", "href");
    const n = normalizeImageUrl(fromImage);
    if (n) return n;
  }

  const htmlBits = [
    tag(block, "content:encoded") || "",
    tag(block, "description") || "",
    block,
  ].join("\n");
  const imgMatch =
    htmlBits.match(/<img[^>]+src=["']([^"']+)["']/i) ||
    htmlBits.match(/src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp|gif)[^"']*)["']/i);
  if (imgMatch?.[1]) {
    const n = normalizeImageUrl(decodeEntities(imgMatch[1]));
    if (n) return n;
  }
  return "";
}

function isGoogleNewsHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "news.google.com" || h.endsWith(".news.google.com");
}

function googleNewsArticleId(articleUrl: string): string {
  try {
    const u = new URL(articleUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p === "articles");
    const id = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];
    return decodeURIComponent(String(id || "").split("?")[0] || "");
  } catch {
    return "";
  }
}

/** Intenta sacar una URL http embebida del id base64 (formato viejo). */
function tryDecodeGoogleNewsIdLocal(articleId: string): string {
  if (!articleId || articleId.length < 20) return "";
  try {
    const pad = articleId.length % 4 === 0 ? "" : "=".repeat(4 - (articleId.length % 4));
    const b64 = articleId.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const text = Buffer.from(b64, "base64").toString("latin1");
    const matches = text.match(/https?:\/\/[^\x00-\x1f\x7f-\xff"<>\s]+/g) || [];
    for (const raw of matches) {
      const cleaned = raw.replace(/[),.;]+$/g, "");
      try {
        const u = new URL(cleaned);
        if (isGoogleNewsHost(u.hostname)) continue;
        if (/google\.(com|[a-z]{2,})/i.test(u.hostname)) continue;
        return u.toString();
      } catch {
        /* next */
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Resuelve wrappers post-2024 de Google News via batchexecute (Fbv4je).
 * Sin esto no se llega al artículo real ni a su og:image.
 */
async function resolveGoogleNewsViaBatchexecute(
  articleUrl: string,
  signal: AbortSignal
): Promise<string> {
  const articleId = googleNewsArticleId(articleUrl);
  if (!articleId) return "";

  const local = tryDecodeGoogleNewsIdLocal(articleId);
  if (local) return local;

  const pageRes = await fetch(articleUrl, {
    signal,
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!pageRes.ok) return "";
  try {
    if (!isGoogleNewsHost(new URL(pageRes.url).hostname)) return pageRes.url;
  } catch {
    /* continue */
  }

  const html = (await pageRes.text()).slice(0, 400_000);
  const signature = html.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1] ?? "";
  const timestamp = html.match(/data-n-a-ts=["']([^"']+)["']/i)?.[1] ?? "";
  if (!signature || !timestamp) {
    // Fallback: primer enlace externo de la landing
    const linkRe = /href=["'](https?:\/\/(?!(?:www\.)?(?:news\.)?google\.[^/"']+)[^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html))) {
      const href = normalizeUrl(decodeEntities(m[1] ?? ""));
      if (!href) continue;
      try {
        const u = new URL(href);
        if (isGoogleNewsHost(u.hostname)) continue;
        if (/accounts\.google|support\.google|policies\.google|youtube\.com|gstatic\.com/i.test(u.hostname)) {
          continue;
        }
        return href;
      } catch {
        /* next */
      }
    }
    return "";
  }

  const rpcInner = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ]);
  const fReq = JSON.stringify([[["Fbv4je", rpcInner, null, "generic"]]]);
  const body = new URLSearchParams({ "f.req": fReq });

  const postRes = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    signal,
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Referer: "https://news.google.com/",
      Origin: "https://news.google.com",
    },
    body,
  });
  if (!postRes.ok) return "";
  let text = await postRes.text();
  if (text.startsWith(")]}'")) text = text.slice(4);
  text = text.trim();
  // Respuesta: líneas con longitud + JSON
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.find((l) => l.startsWith("[")) || text;
  try {
    const envelopes = JSON.parse(jsonLine) as unknown;
    if (!Array.isArray(envelopes)) return "";
    for (const env of envelopes) {
      if (!Array.isArray(env) || env.length < 3) continue;
      if (env[0] !== "wrb.fr" || env[1] !== "Fbv4je") continue;
      const payload = JSON.parse(String(env[2] ?? "")) as unknown;
      if (Array.isArray(payload) && payload[0] === "garturlres" && typeof payload[1] === "string") {
        const resolved = normalizeUrl(payload[1]);
        if (resolved) return resolved;
      }
    }
  } catch {
    // Último recurso: regex de URL en el body
    const m = text.match(/https?:\\\/\\\/[^"\\]+/) || text.match(/https?:\/\/[^"\s\\]+/);
    if (m?.[0]) {
      const cleaned = m[0].replace(/\\\//g, "/");
      try {
        const u = new URL(cleaned);
        if (!isGoogleNewsHost(u.hostname)) return u.toString();
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

/** Si el link es de Google News, intenta resolver la URL del medio original. */
export async function resolvePublisherUrl(articleUrl: string, signal?: AbortSignal): Promise<string> {
  const ctrl = signal ?? new AbortController().signal;
  let host = "";
  try {
    host = new URL(articleUrl).hostname;
  } catch {
    return "";
  }
  if (!isGoogleNewsHost(host)) return articleUrl;

  try {
    const resolved = await resolveGoogleNewsViaBatchexecute(articleUrl, ctrl);
    if (!resolved) return "";
    const rh = hostOf(resolved);
    if (!rh || isGoogleNewsHost(rh) || /(^|\.)google\./.test(rh)) return "";
    return resolved;
  } catch {
    return "";
  }
}

function extractOgImageFromHtml(html: string): string {
  const candidates = [
    html.match(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i)?.[1],
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1],
    html.match(/<meta[^>]+property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i)?.[1],
    html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1],
    html.match(
      /<img[^>]+(?:class|id)=["'][^"']*(?:hero|featured|main|article|post-thumbnail|wp-post-image)[^"']*["'][^>]+src=["']([^"']+)["']/i
    )?.[1],
    html.match(/["']image["']\s*:\s*["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)?.[1],
  ];
  for (const raw of candidates) {
    const n = normalizeImageUrl(decodeEntities(String(raw ?? "")));
    if (n) return n;
  }
  return "";
}

async function fetchMicrolinkImage(articleUrl: string, signal: AbortSignal): Promise<string> {
  // Nunca pedir meta de wrappers de Google: devuelve el mismo preview genérico.
  if (isGoogleNewsHost(hostOf(articleUrl))) return "";
  try {
    const api = `https://api.microlink.io/?url=${encodeURIComponent(articleUrl)}&meta`;
    const res = await fetch(api, {
      signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      status?: string;
      data?: { image?: { url?: string } | string; logo?: { url?: string } };
    };
    if (data.status !== "success") return "";
    const img = data.data?.image;
    const url = typeof img === "string" ? img : img?.url || "";
    return normalizeImageUrl(url);
  } catch {
    return "";
  }
}

export async function fetchOgImage(articleUrl: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const target = await resolvePublisherUrl(articleUrl, ctrl.signal);
    // Sin URL real del medio: mejor sin imagen que un placeholder falso de Google.
    if (!target || isGoogleNewsHost(hostOf(target))) return "";

    // 1) Scrapeo directo del HTML del medio
    try {
      const res = await fetch(target, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
        },
        redirect: "follow",
      });
      if (res.ok) {
        // Si el redirect termina en Google, descartar
        if (isGoogleNewsHost(hostOf(res.url))) return "";
        const html = (await res.text()).slice(0, 280_000);
        const fromHtml = extractOgImageFromHtml(html);
        if (fromHtml) return fromHtml;
      }
    } catch {
      /* fallback below */
    }

    // 2) Meta via Microlink solo sobre la URL del medio (nunca Google News)
    if (!ctrl.signal.aborted) {
      const viaApi = await fetchMicrolinkImage(target, ctrl.signal);
      if (viaApi) return viaApi;
    }
    return "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
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

/** Fuentes que no queremos en el wire (por nombre o dominio). */
const BLOCKED_SOURCE_RE = /\bmoomoo\b/i;
const BLOCKED_HOST_RE = /(^|\.)moomoo\.com$/i;

export function isBlockedNewsSource(sourceName: string, url: string): boolean {
  if (BLOCKED_SOURCE_RE.test(sourceName || "")) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (BLOCKED_HOST_RE.test(host)) return true;
    if (BLOCKED_SOURCE_RE.test(host)) return true;
  } catch {
    if (BLOCKED_SOURCE_RE.test(url || "")) return true;
  }
  return false;
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
    if (isBlockedNewsSource(sourceName, link)) continue;
    out.push({
      title: title.slice(0, 400),
      summary,
      url: link.slice(0, 2000),
      sourceName: sourceName.slice(0, 160),
      topics: inferTopics(title, summary, feedTopics),
      publishedAt: toIsoDate(pub),
      imageUrl: extractItemImage(block),
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
  feeds: readonly HarvestFeed[] = CRYPTO_NOTICIAS_FEEDS,
  opts?: { enrichImages?: boolean; imageLimit?: number }
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
          byUrl.set(item.url, {
            ...prev,
            topics: [...topics],
            imageUrl: prev.imageUrl || item.imageUrl,
          });
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

  // og:image es costoso en Vercel: solo bajo demanda y con tope bajo.
  const enrichImages = opts?.enrichImages === true;
  const imageLimit = Math.max(0, Math.min(20, opts?.imageLimit ?? 8));
  if (enrichImages && imageLimit > 0) {
    const needImg = drafts.filter((d) => !d.imageUrl).slice(0, imageLimit);
    if (needImg.length > 0) {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(3, needImg.length) }, async () => {
        while (cursor < needImg.length) {
          const i = cursor++;
          const d = needImg[i]!;
          const img = await fetchOgImage(d.url);
          if (img) d.imageUrl = img;
        }
      });
      await Promise.all(workers);
    }
  }

  return { drafts, feedErrors };
}
