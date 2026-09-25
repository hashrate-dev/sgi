export const ROXY_FACTS_CAP = 140;
export const ROXY_SAID_CAP = 56;
/** Solo titulares de las últimas 24 h (actualidad). */
export const ROXY_NEWS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RoxyFactKind = "tape" | "news" | "coin";

export type RoxyFact = {
  id: string;
  at: number;
  kind: RoxyFactKind;
  symbol: string;
  key: string;
  text: string;
};

export type RoxyNewsHit = {
  url: string;
  title: string;
  summary: string;
  source: string;
  symbol: string;
  at: number;
};

type TapeSnap = {
  symbol: string;
  interval?: string;
  bias?: string;
  rsi?: number;
  ichiCloud?: string;
  confidence?: number;
  price?: number;
};

function rid(at: number): string {
  return `${at}-${Math.random().toString(16).slice(2, 8)}`;
}

export function roxyDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function normRoxyTalk(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function roxyTooClose(a: string, b: string): boolean {
  const na = normRoxyTalk(a);
  const nb = normRoxyTalk(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const short = na.length <= nb.length ? na : nb;
  const long = na.length <= nb.length ? nb : na;
  if (short.length >= 18 && long.includes(short.slice(0, Math.min(48, short.length)))) return true;
  const wa = short.split(" ").filter((w) => w.length > 3);
  if (wa.length >= 4) {
    const wb = new Set(long.split(" ").filter((w) => w.length > 3));
    const hit = wa.filter((w) => wb.has(w)).length;
    if (hit / wa.length >= 0.52) return true;
  }
  return false;
}

export function pushRoxyFact(facts: RoxyFact[], fact: Omit<RoxyFact, "id">): RoxyFact[] {
  const hit = facts.find((f) => f.key === fact.key);
  if (hit) {
    return facts.map((f) => (f.key === fact.key ? { ...f, at: fact.at, text: fact.text, symbol: fact.symbol } : f));
  }
  return [{ ...fact, id: rid(fact.at) }, ...facts].slice(0, ROXY_FACTS_CAP);
}

export function rememberRoxySaid(said: string[], lines: string[]): string[] {
  let next = said.slice();
  for (const line of lines) {
    const n = normRoxyTalk(line);
    if (n.length < 8) continue;
    next = [n, ...next.filter((x) => x !== n)];
  }
  return next.slice(0, ROXY_SAID_CAP);
}

export function hydrateRoxyFacts(raw: unknown): RoxyFact[] {
  if (!Array.isArray(raw)) return [];
  const out: RoxyFact[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<RoxyFact>;
    if (typeof r.text !== "string" || typeof r.key !== "string") continue;
    if (r.kind !== "tape" && r.kind !== "news" && r.kind !== "coin") continue;
    out.push({
      id: String(r.id || rid(Number(r.at) || Date.now())),
      at: Number(r.at) || 0,
      kind: r.kind,
      symbol: String(r.symbol || ""),
      key: r.key.slice(0, 240),
      text: r.text.slice(0, 320),
    });
  }
  return out.slice(0, ROXY_FACTS_CAP);
}

export function hydrateRoxySaid(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 4).slice(0, ROXY_SAID_CAP);
}

export function ingestTapeFacts(facts: RoxyFact[], snaps: TapeSnap[], now: number): RoxyFact[] {
  let next = facts;
  const day = roxyDayKey(now);
  for (const s of snaps) {
    if (!s.symbol) continue;
    const name = s.symbol.replace(/USDT$/i, "");
    const rsi = Number.isFinite(s.rsi) ? Math.round(Number(s.rsi)) : 0;
    const rsiB = Math.round(rsi / 8) * 8;
    const cloud = s.ichiCloud || "na";
    const bias = s.bias || "wait";
    const conf = Number.isFinite(s.confidence) ? Math.round(Number(s.confidence)) : 0;
    const key = `tape:${s.symbol}:${day}:${bias}:${cloud}:${rsiB}`;
    next = pushRoxyFact(next, {
      at: now,
      kind: "tape",
      symbol: s.symbol,
      key,
      text: `${name} ${s.interval || ""}: sesgo ${bias}, RSI ${rsi}, nube ${cloud}, conf ${conf}%.`.replace(/\s+/g, " ").trim(),
    });
  }
  return next;
}

export function pruneRoxyNewsFacts(facts: RoxyFact[], now = Date.now()): RoxyFact[] {
  const cutoff = now - ROXY_NEWS_MAX_AGE_MS;
  return facts.filter((f) => {
    if (f.kind !== "news" && f.kind !== "coin") return true;
    return Number(f.at) >= cutoff;
  });
}

export function ingestNewsFacts(facts: RoxyFact[], hits: RoxyNewsHit[], now: number): RoxyFact[] {
  const cutoff = now - ROXY_NEWS_MAX_AGE_MS;
  let next = pruneRoxyNewsFacts(facts, now);
  for (const h of hits) {
    const at = Number(h.at) || 0;
    if (!at || at < cutoff) continue;
    const title = h.title.replace(/\s+/g, " ").trim().slice(0, 180);
    if (title.length < 12) continue;
    next = pushRoxyFact(next, {
      at: h.at || now,
      kind: "news",
      symbol: h.symbol,
      key: `news:${h.url.slice(0, 200)}`,
      text: `${title}${h.source ? ` (${h.source})` : ""}`,
    });
    if (h.symbol) {
      next = pushRoxyFact(next, {
        at: h.at || now,
        kind: "coin",
        symbol: h.symbol,
        key: `coin:${h.symbol}:${roxyDayKey(h.at || now)}:${title.slice(0, 48)}`,
        text: `${h.symbol.replace(/USDT$/i, "")} en el wire: ${title}`,
      });
    }
  }
  return next;
}

export function pickFreshFact(
  facts: RoxyFact[],
  kind: RoxyFactKind | "any",
  symbols: string[],
  avoid: string[],
  salt: number,
): RoxyFact | null {
  const want = new Set(symbols);
  const pool = facts.filter((f) => {
    if (kind !== "any" && f.kind !== kind) return false;
    if ((f.kind === "news" || f.kind === "coin") && Number(f.at) < Date.now() - ROXY_NEWS_MAX_AGE_MS) return false;
    if (want.size && f.symbol && !want.has(f.symbol)) return false;
    const blob = normRoxyTalk(f.text);
    if (
      avoid.some(
        (a) =>
          roxyTooClose(a, f.text) ||
          (blob.length >= 18 && normRoxyTalk(a).includes(blob.slice(0, 36))),
      )
    ) {
      return false;
    }
    return true;
  });
  if (!pool.length) return null;
  return pool[Math.abs(salt) % pool.length]!;
}

export function roxyQuietGapMs(patience = 50, discipline = 50, afterStop = false): number {
  let ms = 8 * 60_000;
  ms += Math.max(0, patience - 48) * 14_000;
  ms += Math.max(0, discipline - 48) * 10_000;
  if (afterStop) ms += 10 * 60_000;
  return Math.min(30 * 60_000, Math.max(4 * 60_000, ms));
}

export function roxyMaySpeak(opts: {
  quietUntil?: number;
  lastTalkKey?: string;
  lastNoteAt?: number;
  sceneKey: string;
  hasEvents: boolean;
  now: number;
}): boolean {
  if (opts.hasEvents) return true;
  if ((opts.quietUntil ?? 0) > opts.now) return false;
  if ((opts.lastTalkKey ?? "") === opts.sceneKey) return false;
  if (opts.lastNoteAt && opts.now - opts.lastNoteAt < 5 * 60_000) return false;
  return true;
}

export function roxySceneKey(input: {
  armed: boolean;
  universe: string;
  opsUsed: number;
  maxOps: number;
  positions: { id: string; t1Done: boolean }[];
  lead?: { symbol: string; bias: string; confidence: number };
  interval?: string;
}): string {
  return [
    input.armed ? "on" : "off",
    input.universe,
    `${input.opsUsed}/${input.maxOps}`,
    input.positions.map((p) => `${p.id}:${p.t1Done ? "t1" : "op"}`).join(",") || "-",
    input.lead ? `${input.lead.symbol}:${input.lead.bias}:${Math.round(input.lead.confidence / 10)}` : "x",
    input.interval || "",
  ].join("|");
}

export function markRoxySpoke(
  mind: { quietUntil?: number; lastTalkKey?: string; patience?: number; discipline?: number },
  sceneKey: string,
  events: { kind: string; reason?: string; pnl?: number }[],
  now: number,
): void {
  mind.lastTalkKey = sceneKey;
  const afterStop = events.some(
    (e) => e.kind === "close" && (e.reason === "stop" || (e.pnl ?? 0) < 0),
  );
  mind.quietUntil = now + roxyQuietGapMs(mind.patience ?? 50, mind.discipline ?? 50, afterStop);
}
