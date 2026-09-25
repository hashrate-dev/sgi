import { buildTradeConfluence } from "./btcTradeConfluence.js";
import {
  narratePaper,
  normalizePaperRunInterval,
  pushPaperNote,
  tickPaperMany,
  type PaperBook,
} from "./mercadosPaperAgent.js";
import { listArmedPaperBooks, saveUserPaperBook } from "./paperBookStore.js";

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
  const iv = normalizePaperRunInterval(book.runInterval);
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
  const { book: ticked, events } = tickPaperMany({ ...book, runInterval: iv }, signals);
  const spoken = narratePaper(ticked, signals, events, pairTag);
  return pushPaperNote(ticked, spoken);
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
}
