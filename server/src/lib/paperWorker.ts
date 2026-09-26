import { buildTradeConfluence } from "./btcTradeConfluence.js";
import {
  narratePaper,
  pushPaperNote,
  roxyWorkInterval,
  tickPaperMany,
  type PaperBook,
} from "./mercadosPaperAgent.js";
import { listArmedPaperBooks, saveUserPaperBook } from "./paperBookStore.js";
import { rememberSgiNewsOnBook } from "./roxyNews.js";
import { markRoxySpoke, roxyMaySpeak, roxySceneKey } from "./roxyMind.js";
import { kickIngest } from "../routes/cryptoNoticias.js";

let lastNewsKickMs = 0;

async function keepSgiNewsHot(): Promise<void> {
  const now = Date.now();
  if (now - lastNewsKickMs < 90_000) return;
  lastNewsKickMs = now;
  try {
    await kickIngest();
  } catch (e) {
    console.error("[sgi-noticias] ingest", e instanceof Error ? e.message : e);
  }
}

export const PAPER_SYMBOLS = ["BTCUSDT", "ETHUSDT", "LTCUSDT", "DOGEUSDT", "ZECUSDT", "SOLUSDT"] as const;

function pairTag(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}

function wantedSymbols(book: PaperBook): string[] {
  const want = new Set<string>();
  if (book.universe === "ALL") {
    for (const s of PAPER_SYMBOLS) want.add(s);
  } else if (PAPER_SYMBOLS.includes(book.universe as (typeof PAPER_SYMBOLS)[number])) {
    want.add(book.universe);
  } else {
    for (const s of PAPER_SYMBOLS) want.add(s);
  }
  for (const p of book.positions) want.add(p.symbol);
  return [...want];
}

export async function tickArmedPaperBook(book: PaperBook): Promise<PaperBook> {
  const iv = roxyWorkInterval(book);
  const symbols = wantedSymbols(book);
  const signals = (
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          return await buildTradeConfluence(symbol, iv);
        } catch {
          return null;
        }
      }),
    )
  ).filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (!signals.length) return book;
  const primed = await rememberSgiNewsOnBook({ ...book, runInterval: iv }, symbols);
  const { book: ticked, events } = tickPaperMany(primed, signals);
  const withNews = { ...ticked, runInterval: iv };
  const now = Date.now();
  const lead = [...signals].sort((a, b) => b.confidence - a.confidence)[0];
  const sceneKey = roxySceneKey({
    armed: withNews.armed,
    universe: withNews.universe,
    opsUsed: withNews.opsUsed,
    maxOps: withNews.maxOps,
    positions: withNews.positions,
    lead,
    interval: lead?.interval || withNews.runInterval,
  });
  if (!withNews.mind) {
    withNews.mind = {
      said: [],
      facts: [],
      newsAt: 0,
      coffee: 0,
      quietUntil: 0,
      lastTalkKey: "",
      lastStopAt: 0,
      revengeUntil: 0,
      lastStopSymbol: "",
    };
  }
  if (
    !roxyMaySpeak({
      quietUntil: withNews.mind.quietUntil,
      lastTalkKey: withNews.mind.lastTalkKey,
      lastNoteAt: withNews.notes[0]?.at,
      sceneKey,
      hasEvents: events.length > 0,
      now,
    })
  ) {
    withNews.mind.lastTalkKey = sceneKey;
    return withNews;
  }
  const spoken = narratePaper(withNews, signals, events, pairTag);
  if (!spoken.body.trim()) {
    withNews.mind.lastTalkKey = sceneKey;
    return withNews;
  }
  const next = pushPaperNote(withNews, spoken);
  markRoxySpoke(next.mind, sceneKey, events, now);
  return next;
}

let running = false;

export async function runArmedPaperAgents(): Promise<{
  ok: true;
  users: number;
  ticked: number;
  failed: number;
}> {
  if (running) return { ok: true, users: 0, ticked: 0, failed: 0 };
  running = true;
  try {
    await keepSgiNewsHot();
    const rows = await listArmedPaperBooks();
    let ticked = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const next = await tickArmedPaperBook(row.book);
        await saveUserPaperBook(row.userId, next);
        ticked += 1;
      } catch (e) {
        failed += 1;
        console.error("[roxy-paper] tick user", row.userId, e instanceof Error ? e.message : e);
      }
    }
    return { ok: true, users: rows.length, ticked, failed };
  } finally {
    running = false;
  }
}

let schedulerStarted = false;

export function startPaperAgentScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void runArmedPaperAgents().catch(() => undefined);
  setInterval(() => {
    void runArmedPaperAgents().catch(() => undefined);
  }, 60_000);
  setInterval(() => {
    void keepSgiNewsHot().catch(() => undefined);
  }, 120_000);
}
