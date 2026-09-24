import type { BtcTradeSignal } from "./api";

const FEE = 0.0004;
const RISK_PCT = 0.01;
const MIN_CONF = 58;
const CASH_CAP = 0.92;
const HIST = 72;
const FILLS = 28;

export type PaperEvent = {
  kind: "open" | "close" | "scale";
  side: "long" | "short";
  reason: string;
  price: number;
  pnl?: number;
  note: string;
};

export type PaperPosition = {
  id: string;
  side: "long" | "short";
  symbol: string;
  interval: string;
  qty: number;
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  t1Done: boolean;
  openedAt: number;
};

export type PaperFill = {
  id: string;
  at: number;
  side: "long" | "short";
  action: "open" | "close" | "scale";
  reason: string;
  price: number;
  qty: number;
  pnl?: number;
  note: string;
};

export type PaperBook = {
  v: 1;
  initialUsd: number;
  cashUsd: number;
  armed: boolean;
  confirm: number;
  lastFire: "buy" | "sell" | "wait";
  position: PaperPosition | null;
  fills: PaperFill[];
  equityHist: number[];
  wins: number;
  losses: number;
  peakUsd: number;
};

export function emptyPaperBook(initialUsd = 10_000): PaperBook {
  const cash = Math.max(100, initialUsd);
  return {
    v: 1,
    initialUsd: cash,
    cashUsd: cash,
    armed: true,
    confirm: 0,
    lastFire: "wait",
    position: null,
    fills: [],
    equityHist: [cash],
    wins: 0,
    losses: 0,
    peakUsd: cash,
  };
}

export function paperStorageKey(userId: number, symbol: string): string {
  return `hrs_paper_v1_${userId}_${symbol}`;
}

export function loadPaperBook(userId: number, symbol: string): PaperBook {
  try {
    const raw = localStorage.getItem(paperStorageKey(userId, symbol));
    if (!raw) return emptyPaperBook();
    const parsed = JSON.parse(raw) as PaperBook;
    if (!parsed || parsed.v !== 1 || !Number.isFinite(parsed.cashUsd)) return emptyPaperBook();
    return parsed;
  } catch {
    return emptyPaperBook();
  }
}

export function savePaperBook(userId: number, symbol: string, book: PaperBook): void {
  try {
    localStorage.setItem(paperStorageKey(userId, symbol), JSON.stringify(book));
  } catch {
    /* quota */
  }
}

export function paperEquity(book: PaperBook, price: number): number {
  if (!book.position) return book.cashUsd;
  return book.cashUsd + book.position.qty * price;
}

function neededConfirm(interval: string): number {
  if (interval === "1s" || interval === "LIVE" || interval === "1") return 3;
  if (interval === "5" || interval === "15") return 2;
  return 1;
}

function pushFill(book: PaperBook, fill: Omit<PaperFill, "id">): void {
  book.fills = [{ ...fill, id: `${fill.at}-${Math.random().toString(16).slice(2, 8)}` }, ...book.fills].slice(0, FILLS);
}

function applyOpen(book: PaperBook, qtySigned: number, price: number): void {
  const abs = Math.abs(qtySigned);
  book.cashUsd -= qtySigned * price;
  book.cashUsd -= abs * price * FEE;
}

function applyCloseQty(book: PaperBook, qtySigned: number, price: number): number {
  const abs = Math.abs(qtySigned);
  const entry = book.position!.entry;
  const pnl = qtySigned * (price - entry) - abs * (entry + price) * FEE;
  book.cashUsd += qtySigned * price;
  book.cashUsd -= abs * price * FEE;
  return pnl;
}

function markHist(book: PaperBook, price: number): void {
  const eq = paperEquity(book, price);
  book.equityHist = [...book.equityHist, eq].slice(-HIST);
  if (eq > book.peakUsd) book.peakUsd = eq;
}

function canEnter(sig: BtcTradeSignal, side: "long" | "short"): boolean {
  if (sig.confidence < MIN_CONF) return false;
  if (side === "long" && sig.rsi >= 76) return false;
  if (side === "short" && sig.rsi <= 24) return false;
  if (side === "long" && sig.ichiCloud === "below") return false;
  if (side === "short" && sig.ichiCloud === "above") return false;
  if (Number.isFinite(sig.volRatio) && (sig.volRatio ?? 1) < 0.82) return false;
  const dist = Math.abs(sig.price - sig.stop);
  if (!(dist > 0) || dist / sig.price < 0.0015) return false;
  return true;
}

function sizeQty(book: PaperBook, sig: BtcTradeSignal, side: "long" | "short"): number {
  const eq = Math.max(book.cashUsd, paperEquity(book, sig.price));
  const riskUsd = eq * RISK_PCT;
  const dist = Math.abs(sig.price - sig.stop);
  let qty = riskUsd / dist;
  const maxQty = (book.cashUsd * CASH_CAP) / sig.price;
  qty = Math.min(qty, maxQty);
  if (!(qty > 0) || qty * sig.price < 25) return 0;
  return side === "long" ? qty : -qty;
}

export function resetPaperBook(initialUsd: number): PaperBook {
  return emptyPaperBook(initialUsd);
}

export function tickPaper(book: PaperBook, sig: BtcTradeSignal): { book: PaperBook; events: PaperEvent[] } {
  const next: PaperBook = {
    ...book,
    fills: [...book.fills],
    equityHist: [...book.equityHist],
    position: book.position ? { ...book.position } : null,
  };
  const events: PaperEvent[] = [];
  const px = sig.price;
  const now = Date.now();
  const fire = sig.bias === "buy" || sig.bias === "sell" ? sig.bias : "wait";

  if (fire === next.lastFire && fire !== "wait") next.confirm += 1;
  else next.confirm = fire === "wait" ? 0 : 1;
  next.lastFire = fire;

  const pos = next.position;
  if (pos && pos.symbol === sig.symbol) {
    const long = pos.qty > 0;
    const hitStop = long ? px <= pos.stop : px >= pos.stop;
    const hitT2 = long ? px >= pos.t2 : px <= pos.t2;
    const hitT1 = !pos.t1Done && (long ? px >= pos.t1 : px <= pos.t1);
    const flip = (long && fire === "sell" && next.confirm >= neededConfirm(sig.interval)) ||
      (!long && fire === "buy" && next.confirm >= neededConfirm(sig.interval));

    if (hitStop) {
      const pnl = applyCloseQty(next, pos.qty, px);
      pushFill(next, {
        at: now,
        side: pos.side,
        action: "close",
        reason: "stop",
        price: px,
        qty: pos.qty,
        pnl,
        note: "Stop / Supertrend-ATR",
      });
      events.push({ kind: "close", side: pos.side, reason: "stop", price: px, pnl, note: "Stop" });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      next.position = null;
      next.confirm = 0;
    } else if (hitT2) {
      const pnl = applyCloseQty(next, pos.qty, px);
      pushFill(next, {
        at: now,
        side: pos.side,
        action: "close",
        reason: "t2",
        price: px,
        qty: pos.qty,
        pnl,
        note: "Objetivo 2",
      });
      events.push({ kind: "close", side: pos.side, reason: "t2", price: px, pnl, note: "T2" });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      next.position = null;
    } else if (hitT1) {
      const part = pos.qty * 0.5;
      const pnl = applyCloseQty(next, part, px);
      pos.qty -= part;
      pos.t1Done = true;
      pos.stop = pos.entry;
      pushFill(next, {
        at: now,
        side: pos.side,
        action: "scale",
        reason: "t1",
        price: px,
        qty: part,
        pnl,
        note: "T1 50% · stop a BE",
      });
      events.push({ kind: "scale", side: pos.side, reason: "t1", price: px, pnl, note: "T1" });
      if (pnl >= 0) next.wins += 1;
    } else if (flip) {
      const pnl = applyCloseQty(next, pos.qty, px);
      pushFill(next, {
        at: now,
        side: pos.side,
        action: "close",
        reason: "flip",
        price: px,
        qty: pos.qty,
        pnl,
        note: "Sesgo invertido",
      });
      events.push({ kind: "close", side: pos.side, reason: "flip", price: px, pnl, note: "Salida por sesgo" });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      next.position = null;
    } else if (long && Number.isFinite(sig.supertrend) && sig.supertrendDir === 1 && sig.supertrend > pos.stop && sig.supertrend < px) {
      pos.stop = Math.max(pos.stop, sig.supertrend);
    } else if (!long && Number.isFinite(sig.supertrend) && sig.supertrendDir === -1 && sig.supertrend < pos.stop && sig.supertrend > px) {
      pos.stop = Math.min(pos.stop, sig.supertrend);
    }
  }

  if (next.armed && !next.position && (fire === "buy" || fire === "sell") && next.confirm >= neededConfirm(sig.interval)) {
    const side = fire === "buy" ? "long" : "short";
    if (canEnter(sig, side)) {
      const qty = sizeQty(next, sig, side);
      if (qty !== 0) {
        applyOpen(next, qty, px);
        next.position = {
          id: `${now}`,
          side,
          symbol: sig.symbol,
          interval: sig.interval,
          qty,
          entry: px,
          stop: sig.stop,
          t1: sig.target1,
          t2: sig.target2,
          t1Done: false,
          openedAt: now,
        };
        pushFill(next, {
          at: now,
          side,
          action: "open",
          reason: "signal",
          price: px,
          qty,
          note: `${sig.confidence}% · ${sig.guide ?? "confluencia"}`.slice(0, 120),
        });
        events.push({
          kind: "open",
          side,
          reason: "signal",
          price: px,
          note: side === "long" ? "LARGO simulado" : "CORTO simulado",
        });
      }
    }
  }

  markHist(next, px);
  return { book: next, events };
}
