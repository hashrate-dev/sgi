/**
 * Traducción on-demand de titulares/resúmenes del wire cripto (ES / PT).
 * Primario: Google gtx. Fallback: MyMemory. Caché en DB (capa de rutas).
 */

export type NewsTranslateLang = "es" | "pt";

const UA = "Mozilla/5.0 (compatible; HashrateSGI-NewsBot/1.0; +https://hashrate.space)";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function looksLikeTargetLang(text: string, lang: NewsTranslateLang): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (lang === "es") {
    return (
      /\b(el|la|los|las|de|del|una|unos|criptomonedas|bitcoin|mercado|gobierno|estados unidos)\b/i.test(t) &&
      /[áéíóúñ¿¡]/i.test(t)
    );
  }
  return (
    /\b(o|a|os|as|de|do|da|uma|criptomoedas|mercado|governo|estados unidos)\b/i.test(t) &&
    /[áàâãéêíóôõúç]/i.test(t)
  );
}

async function translateViaGoogle(text: string, tl: NewsTranslateLang): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", tl);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text.slice(0, 4500));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error("translate: formato inesperado");
    }
    const parts = (data[0] as unknown[])
      .map((row) => (Array.isArray(row) ? String(row[0] ?? "") : ""))
      .filter(Boolean);
    const out = parts.join("").trim();
    if (!out) throw new Error("translate: vacío");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function translateViaMyMemory(text: string, tl: NewsTranslateLang): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 450));
  url.searchParams.set("langpair", `en|${tl}`);
  url.searchParams.set("de", "noticias@hashrate.space");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`mymemory HTTP ${res.status}`);
    const data = (await res.json()) as { responseData?: { translatedText?: string }; responseStatus?: number };
    const out = String(data.responseData?.translatedText ?? "").trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error("mymemory: sin traducción");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function translateChunk(text: string, tl: NewsTranslateLang): Promise<string> {
  const q = text.trim();
  if (!q) return "";
  if (looksLikeTargetLang(q, tl)) return q;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await sleep(350 * attempt);
      return await translateViaGoogle(q, tl);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "RATE_LIMIT" && attempt === 0) break;
    }
  }

  try {
    await sleep(200);
    return await translateViaMyMemory(q, tl);
  } catch (e) {
    console.error(
      "[crypto-noticias] translate fail",
      lastErr instanceof Error ? lastErr.message : lastErr,
      e instanceof Error ? e.message : e
    );
    return q;
  }
}

export async function translateNewsText(text: string, tl: NewsTranslateLang): Promise<string> {
  const q = text.trim();
  if (!q) return "";
  try {
    if (q.length <= 900) return await translateChunk(q, tl);
    const chunks = q.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const out: string[] = [];
    let buf = "";
    for (const c of chunks) {
      if ((buf + " " + c).trim().length > 850) {
        if (buf) out.push(await translateChunk(buf, tl));
        buf = c;
      } else {
        buf = buf ? `${buf} ${c}` : c;
      }
    }
    if (buf) out.push(await translateChunk(buf, tl));
    return out.join(" ").trim() || q;
  } catch (e) {
    console.error("[crypto-noticias] translate", e instanceof Error ? e.message : e);
    return q;
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i] as T, i);
      if (i % 3 === 2) await sleep(120);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}
