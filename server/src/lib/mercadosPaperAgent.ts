import type { TradeConfluence } from "./btcTradeConfluence.js";

type BtcTradeSignal = TradeConfluence;

const FEE = 0.0004;
const MIN_CONF = 58;
const CASH_CAP = 0.92;
const DEFAULT_RISK_PCT = 1;
const DEFAULT_SIZE_PCT = 25;
const DEFAULT_T1_PCT = 50;
const HIST = 72;
const FILLS = 48;
const TRADES = 200;
const NOTES = 24;
const MAX_OPS_MIN = 1;
const MAX_OPS_MAX = 999;
const DEFAULT_MAX_OPS = 10;
const DEFAULT_MAX_OPS_DAY = 10;

export type PaperEvent = {
  kind: "open" | "close" | "scale";
  side: "long" | "short";
  symbol: string;
  reason: string;
  price: number;
  pnl?: number;
  note: string;
};

export type PaperMode = "all" | "spot-long" | "fut-long" | "fut-short";
export type PaperLev = 1 | 2 | 3;
export type PaperVenue = "spot" | "futures";
export type PaperDir = "long" | "short" | "both";
export type PaperStyle = "auto" | "intraday" | "swing";
export type PaperSwingDays = 1 | 2 | 3;

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
  leverage: PaperLev;
  venue: PaperVenue;
  marginUsd: number;
};

export type PaperFill = {
  id: string;
  at: number;
  symbol: string;
  side: "long" | "short";
  action: "open" | "close" | "scale";
  reason: string;
  price: number;
  qty: number;
  pnl?: number;
  note: string;
};

export type PaperTradeStatus = "open" | "closed";

export type PaperTrade = {
  id: string;
  symbol: string;
  side: "long" | "short";
  interval: string;
  qty: number;
  qtyLeft: number;
  entry: number;
  stop: number;
  t1: number;
  t2: number;
  openedAt: number;
  closedAt: number | null;
  exit: number | null;
  exitReason: string | null;
  realizedPnl: number;
  t1Done: boolean;
  t1At: number | null;
  t1Price: number | null;
  t1Pnl: number | null;
  status: PaperTradeStatus;
  leverage: PaperLev;
  venue: PaperVenue;
};

export type PaperUniverse = "ALL" | string;

export type PaperNoteTone = "idle" | "watch" | "open" | "hold" | "adjust" | "close" | "cap" | "pause";

export type PaperNote = {
  id: string;
  at: number;
  tone: PaperNoteTone;
  title: string;
  body: string;
  fingerprint: string;
};

export type PaperBook = {
  v: 2;
  universe: PaperUniverse;
  initialUsd: number;
  cashUsd: number;
  armed: boolean;
  maxOps: number;
  maxOpsDay: number;
  opsUsed: number;
  mode: PaperMode;
  leverage: PaperLev;
  runInterval: string;
  riskPct: number;
  sizePct: number;
  minConf: number;
  t1Pct: number;
  style: PaperStyle;
  swingDays: PaperSwingDays;
  confirms: Record<string, { fire: "buy" | "sell" | "wait"; n: number }>;
  positions: PaperPosition[];
  trades: PaperTrade[];
  fills: PaperFill[];
  notes: PaperNote[];
  equityHist: number[];
  wins: number;
  losses: number;
  peakUsd: number;
};

export function clampPaperMaxOps(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_OPS;
  return Math.max(MAX_OPS_MIN, Math.min(MAX_OPS_MAX, Math.floor(n)));
}

export function clampPaperMaxOpsDay(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_OPS_DAY;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

export function clampPaperLev(n: number): PaperLev {
  if (!Number.isFinite(n)) return 1;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

export function clampPaperRiskPct(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RISK_PCT;
  return Math.round(Math.max(0.25, Math.min(5, n)) * 4) / 4;
}

export function clampPaperSizePct(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SIZE_PCT;
  return Math.round(Math.max(5, Math.min(100, n)));
}

export function clampPaperMinConf(n: number): number {
  if (!Number.isFinite(n)) return MIN_CONF;
  return Math.round(Math.max(50, Math.min(85, n)));
}

export function clampPaperT1Pct(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_T1_PCT;
  return Math.round(Math.max(25, Math.min(75, n)));
}

export function clampPaperSwingDays(n: number): PaperSwingDays {
  if (!Number.isFinite(n)) return 2;
  if (n >= 3) return 3;
  if (n <= 1) return 1;
  return 2;
}

export function paperMinConfOf(book: PaperBook): number {
  return clampPaperMinConf(book.minConf ?? MIN_CONF);
}

export function normalizePaperStyle(raw: unknown): PaperStyle {
  if (raw === "swing" || raw === "intraday" || raw === "auto") return raw;
  return "auto";
}

export function paperStyleOf(book: Pick<PaperBook, "style"> | { style?: unknown }): PaperStyle {
  const s = normalizePaperStyle(book.style);
  return s === "auto" ? "intraday" : s;
}

type ScalpBand = "ultra" | "fast" | "mid" | "hour" | "context";

function scalpBand(interval: string): ScalpBand {
  if (interval === "1s" || interval === "LIVE" || interval === "1") return "ultra";
  if (interval === "5") return "fast";
  if (interval === "15" || interval === "30") return "mid";
  if (interval === "60") return "hour";
  return "context";
}

function paperAllowsOpen(interval: string, style: PaperStyle): boolean {
  if (style === "swing") {
    return interval === "15" || interval === "30" || interval === "60" || interval === "240" || interval === "D";
  }
  return scalpBand(interval) !== "context";
}

function entryPlan(sig: BtcTradeSignal, side: "long" | "short", style: PaperStyle): { stop: number; t1: number; t2: number } {
  if (style !== "swing") return scalpPlan(sig, side);
  const px = sig.price;
  const b = scalpBand(sig.interval);
  const t1p = b === "context" ? 0.028 : b === "hour" ? 0.018 : 0.012;
  const t2p = b === "context" ? 0.05 : b === "hour" ? 0.032 : 0.022;
  const stopP = b === "context" ? 0.018 : b === "hour" ? 0.012 : 0.008;
  if (side === "long") {
    const stop = Math.max(sig.stop, px * (1 - stopP));
    let t1 = Math.min(sig.target1, px * (1 + t1p));
    let t2 = Math.min(sig.target2, px * (1 + t2p));
    if (!(t1 > px)) t1 = px * (1 + t1p);
    if (!(t2 > t1)) t2 = px * (1 + t2p);
    return { stop, t1, t2 };
  }
  const stop = Math.min(sig.stop, px * (1 + stopP));
  let t1 = Math.max(sig.target1, px * (1 - t1p));
  let t2 = Math.max(sig.target2, px * (1 - t2p));
  if (!(t1 < px)) t1 = px * (1 - t1p);
  if (!(t2 < t1)) t2 = px * (1 - t2p);
  return { stop, t1, t2 };
}

function scalpMaxHoldMs(interval: string): number {
  const b = scalpBand(interval);
  if (b === "ultra") return 25 * 60 * 1000;
  if (b === "fast") return 90 * 60 * 1000;
  if (b === "mid") return 4 * 60 * 60 * 1000;
  return 8 * 60 * 60 * 1000;
}

function uruguayDayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function scalpPlan(sig: BtcTradeSignal, side: "long" | "short"): { stop: number; t1: number; t2: number } {
  const px = sig.price;
  const b = scalpBand(sig.interval);
  const t1p = b === "ultra" ? 0.0022 : b === "fast" ? 0.0034 : b === "mid" ? 0.0052 : 0.008;
  const t2p = b === "ultra" ? 0.0042 : b === "fast" ? 0.0062 : b === "mid" ? 0.0095 : 0.014;
  const stopP = b === "ultra" ? 0.002 : b === "fast" ? 0.003 : b === "mid" ? 0.0045 : 0.0065;
  if (side === "long") {
    const stop = Math.max(sig.stop, px * (1 - stopP));
    let t1 = Math.min(sig.target1, px * (1 + t1p));
    let t2 = Math.min(sig.target2, px * (1 + t2p));
    if (!(t1 > px)) t1 = px * (1 + t1p);
    if (!(t2 > t1)) t2 = px * (1 + t2p);
    return { stop, t1, t2 };
  }
  const stop = Math.min(sig.stop, px * (1 + stopP));
  let t1 = Math.max(sig.target1, px * (1 - t1p));
  let t2 = Math.max(sig.target2, px * (1 - t2p));
  if (!(t1 < px)) t1 = px * (1 - t1p);
  if (!(t2 < t1)) t2 = px * (1 - t2p);
  return { stop, t1, t2 };
}

export function normalizePaperMode(raw: unknown): PaperMode {
  if (raw === "spot-long" || raw === "fut-long" || raw === "fut-short" || raw === "all") return raw;
  return "all";
}

export function normalizePaperRunInterval(raw: unknown): string {
  const iv = String(raw ?? "").trim();
  if (iv === "LIVE") return "1s";
  if (iv === "1s" || iv === "1" || iv === "5" || iv === "15" || iv === "30" || iv === "60" || iv === "240" || iv === "D") {
    return iv;
  }
  return "60";
}

export function paperVenueOf(mode: PaperMode): PaperVenue {
  return mode === "spot-long" ? "spot" : "futures";
}

export function paperDirOf(mode: PaperMode): PaperDir {
  if (mode === "fut-short") return "short";
  if (mode === "all") return "both";
  return "long";
}

export function composePaperMode(venue: PaperVenue, dir: PaperDir): PaperMode {
  if (venue === "spot") return "spot-long";
  if (dir === "short") return "fut-short";
  if (dir === "long") return "fut-long";
  return "all";
}

export function paperEffectiveLev(mode: PaperMode, leverage: PaperLev): PaperLev {
  return mode === "spot-long" ? 1 : clampPaperLev(leverage);
}

export function paperAllowsSide(mode: PaperMode, side: "long" | "short"): boolean {
  if (mode === "fut-short") return side === "short";
  if (mode === "spot-long" || mode === "fut-long") return side === "long";
  return true;
}

export function emptyPaperBook(
  initialUsd = 10_000,
  universe: PaperUniverse = "ALL",
  maxOps = DEFAULT_MAX_OPS,
  mode: PaperMode = "all",
  leverage: PaperLev = 1,
): PaperBook {
  const cash = Math.max(100, initialUsd);
  const md = normalizePaperMode(mode);
  return {
    v: 2,
    universe,
    initialUsd: cash,
    cashUsd: cash,
    armed: true,
    maxOps: clampPaperMaxOps(maxOps),
    maxOpsDay: DEFAULT_MAX_OPS_DAY,
    opsUsed: 0,
    mode: md,
    leverage: paperEffectiveLev(md, leverage),
    runInterval: "60",
    riskPct: DEFAULT_RISK_PCT,
    sizePct: DEFAULT_SIZE_PCT,
    minConf: MIN_CONF,
    t1Pct: DEFAULT_T1_PCT,
    style: "intraday" as PaperStyle,
    swingDays: 2 as PaperSwingDays,
    confirms: {},
    positions: [],
    trades: [],
    fills: [],
    notes: [],
    equityHist: [cash],
    wins: 0,
    losses: 0,
    peakUsd: cash,
  };
}

export function paperStorageKey(userId: number): string {
  return `hrs_paper_v2_${userId}`;
}

function migrateV1(userId: number): PaperBook | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const prefix = `hrs_paper_v1_${userId}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      const parsed = JSON.parse(localStorage.getItem(k) ?? "") as {
        v?: number;
        cashUsd?: number;
        initialUsd?: number;
        armed?: boolean;
        position?: PaperPosition | null;
        fills?: PaperFill[];
        equityHist?: number[];
        wins?: number;
        losses?: number;
        peakUsd?: number;
      };
      if (!parsed || !Number.isFinite(parsed.cashUsd)) continue;
      const cash = Number(parsed.cashUsd);
      const pos = parsed.position ?? null;
      const trades = pos ? [tradeFromPosition(pos)] : [];
      return {
        ...emptyPaperBook(parsed.initialUsd ?? cash, pos?.symbol ?? "ALL"),
        cashUsd: cash,
        armed: parsed.armed !== false,
        opsUsed: pos ? 1 : 0,
        positions: pos ? [pos] : [],
        trades,
        fills: (parsed.fills ?? []).map((f) => ({ ...f, symbol: f.symbol || pos?.symbol || "" })),
        equityHist: parsed.equityHist ?? [cash],
        wins: parsed.wins ?? 0,
        losses: parsed.losses ?? 0,
        peakUsd: parsed.peakUsd ?? cash,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function tradeFromPosition(pos: PaperPosition): PaperTrade {
  return {
    id: pos.id,
    symbol: pos.symbol,
    side: pos.side,
    interval: pos.interval,
    qty: pos.qty,
    qtyLeft: pos.qty,
    entry: pos.entry,
    stop: pos.stop,
    t1: pos.t1,
    t2: pos.t2,
    openedAt: pos.openedAt,
    closedAt: null,
    exit: null,
    exitReason: null,
    realizedPnl: 0,
    t1Done: pos.t1Done,
    t1At: null,
    t1Price: null,
    t1Pnl: null,
    status: "open",
    leverage: pos.leverage ?? 1,
    venue: pos.venue ?? (pos.side === "short" ? "futures" : "spot"),
  };
}

function normalizeTrade(raw: Partial<PaperTrade>, fallback?: PaperPosition): PaperTrade | null {
  const id = raw.id || fallback?.id;
  const symbol = raw.symbol || fallback?.symbol;
  if (!id || !symbol) return null;
  const openedAt = raw.openedAt ?? fallback?.openedAt ?? Date.now();
  const qty = raw.qty ?? fallback?.qty ?? 0;
  const status: PaperTradeStatus = raw.status === "closed" || raw.closedAt ? "closed" : "open";
  return {
    id,
    symbol,
    side: raw.side === "short" || fallback?.side === "short" ? "short" : "long",
    interval: raw.interval || fallback?.interval || "",
    qty,
    qtyLeft: status === "closed" ? 0 : (raw.qtyLeft ?? fallback?.qty ?? qty),
    entry: raw.entry ?? fallback?.entry ?? 0,
    stop: raw.stop ?? fallback?.stop ?? 0,
    t1: raw.t1 ?? fallback?.t1 ?? 0,
    t2: raw.t2 ?? fallback?.t2 ?? 0,
    openedAt,
    closedAt: raw.closedAt ?? null,
    exit: raw.exit ?? null,
    exitReason: raw.exitReason ?? null,
    realizedPnl: Number.isFinite(raw.realizedPnl) ? Number(raw.realizedPnl) : 0,
    t1Done: Boolean(raw.t1Done ?? fallback?.t1Done),
    t1At: raw.t1At ?? null,
    t1Price: raw.t1Price ?? null,
    t1Pnl: Number.isFinite(raw.t1Pnl) ? Number(raw.t1Pnl) : null,
    status,
    leverage: clampPaperLev(raw.leverage ?? fallback?.leverage ?? 1),
    venue: raw.venue ?? fallback?.venue ?? (raw.side === "short" || fallback?.side === "short" ? "futures" : "spot"),
  };
}

export function hydratePaperBook(parsed: Partial<PaperBook> & { v?: number }): PaperBook | null {
  if (parsed?.v !== 2 || !Number.isFinite(parsed.cashUsd)) return null;
  const positions = parsed.positions ?? [];
  let trades = (parsed.trades ?? []).map((t) => normalizeTrade(t)).filter((t): t is PaperTrade => Boolean(t));
  for (const pos of positions) {
    if (!trades.some((t) => t.id === pos.id)) trades = [tradeFromPosition(pos), ...trades];
  }
  const opsUsed = Number.isFinite(parsed.opsUsed) ? Math.max(0, Math.floor(parsed.opsUsed as number)) : trades.length;
  const mode = normalizePaperMode(parsed.mode);
  const positionsHydrated = positions.map((p) => {
    const lev = clampPaperLev(p.leverage ?? 1);
    const venue = p.venue ?? (p.side === "short" ? "futures" : paperVenueOf(mode));
    const marginUsd =
      Number.isFinite(p.marginUsd) && (p.marginUsd as number) > 0
        ? Number(p.marginUsd)
        : Math.abs(p.qty) * p.entry / lev;
    return { ...p, leverage: lev, venue, marginUsd };
  });
  return {
    ...emptyPaperBook(parsed.initialUsd, parsed.universe, parsed.maxOps, mode, parsed.leverage),
    ...parsed,
    mode,
    leverage: paperEffectiveLev(mode, parsed.leverage ?? 1),
    runInterval: normalizePaperRunInterval(parsed.runInterval),
    riskPct: clampPaperRiskPct(parsed.riskPct ?? DEFAULT_RISK_PCT),
    sizePct: clampPaperSizePct(parsed.sizePct ?? DEFAULT_SIZE_PCT),
    minConf: clampPaperMinConf(parsed.minConf ?? MIN_CONF),
    t1Pct: clampPaperT1Pct(parsed.t1Pct ?? DEFAULT_T1_PCT),
    style: normalizePaperStyle(parsed.style),
    swingDays: clampPaperSwingDays(Number((parsed as { swingDays?: unknown }).swingDays)),
    maxOps: clampPaperMaxOps(parsed.maxOps ?? DEFAULT_MAX_OPS),
    maxOpsDay: clampPaperMaxOpsDay(parsed.maxOpsDay ?? DEFAULT_MAX_OPS_DAY),
    opsUsed,
    positions: positionsHydrated,
    trades: trades.slice(0, TRADES),
    confirms: parsed.confirms ?? {},
    fills: parsed.fills ?? [],
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, NOTES) : [],
  };
}

export function loadPaperBook(userId: number): PaperBook {
  try {
    if (typeof localStorage === "undefined") return emptyPaperBook();
    const raw = localStorage.getItem(paperStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PaperBook> & { v?: number };
      const hydrated = hydratePaperBook(parsed);
      if (hydrated) return hydrated;
    }
    return migrateV1(userId) ?? emptyPaperBook();
  } catch {
    return emptyPaperBook();
  }
}

export function savePaperBook(userId: number, book: PaperBook): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(paperStorageKey(userId), JSON.stringify(book));
  } catch {
    /* quota */
  }
}

export function paperEquity(book: PaperBook, marks: Record<string, number>): number {
  let eq = book.cashUsd;
  for (const p of book.positions) {
    const px = marks[p.symbol] ?? p.entry;
    const lev = clampPaperLev(p.leverage ?? 1);
    const margin = Number.isFinite(p.marginUsd) && p.marginUsd > 0 ? p.marginUsd : Math.abs(p.qty) * p.entry / lev;
    eq += margin + p.qty * (px - p.entry);
  }
  return eq;
}

export function paperOpsLeft(book: PaperBook): number {
  return Math.max(0, book.maxOps - book.opsUsed);
}

export function paperAtOpsCap(book: PaperBook): boolean {
  return book.opsUsed >= book.maxOps;
}

export function paperUtcDayStart(ms = Date.now()): number {
  const key = uruguayDayKey(ms);
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 3, 0, 0);
}

export function paperOpsToday(book: PaperBook, now = Date.now()): number {
  const start = paperUtcDayStart(now);
  const seen = new Set<string>();
  for (const t of book.trades) {
    if (t.openedAt >= start) seen.add(t.id);
  }
  return seen.size;
}

export function paperAtDayCap(book: PaperBook, now = Date.now()): boolean {
  return paperOpsToday(book, now) >= clampPaperMaxOpsDay(book.maxOpsDay ?? DEFAULT_MAX_OPS_DAY);
}

export function paperCanOpen(book: PaperBook, now = Date.now()): boolean {
  return !paperAtOpsCap(book) && !paperAtDayCap(book, now);
}

export type PaperAlertLight = "red" | "yellow" | "green";

export type PaperEntryAlert = {
  light: PaperAlertLight;
  score: number;
  intent: "buy" | "sell" | "none";
  headline: string;
  detail: string;
  symbol: string;
};

export function paperEntryAlert(book: PaperBook, signals: BtcTradeSignal[]): PaperEntryAlert {
  const mode = normalizePaperMode(book.mode);
  const view =
    book.universe === "ALL"
      ? signals
      : signals.filter((s) => s.symbol === book.universe || book.positions.some((p) => p.symbol === s.symbol));

  const scoreOf = (sig: BtcTradeSignal, side: "buy" | "sell"): number => {
    if (!paperAllowsSide(mode, side === "buy" ? "long" : "short")) return 0;
    const need = neededConfirm(sig.interval);
    const c = book.confirms[sig.symbol];
    const n = c && c.fire === side ? c.n : sig.bias === side ? 1 : 0;
    const align = Math.max(0, Math.min(100, sig.confidence));
    const confPart = (Math.min(n, need) / need) * 100;
    let s = align * 0.62 + confPart * 0.38;
    if (sig.bias !== side) s *= 0.32;
    if (align < MIN_CONF) s = Math.min(s, 50);
    if (side === "buy" && sig.rsi >= 76) s = Math.min(s, 38);
    if (side === "sell" && sig.rsi <= 24) s = Math.min(s, 38);
    return Math.round(Math.max(0, Math.min(100, s)));
  };

  let best: PaperEntryAlert = {
    light: "red",
    score: 0,
    intent: "none",
    headline: "No va a comprar",
    detail: "Todavía no hay lectura.",
    symbol: "",
  };

  for (const sig of view) {
    const buy = scoreOf(sig, "buy");
    const sell = scoreOf(sig, "sell");
    const pick = buy >= sell ? ({ intent: "buy" as const, score: buy }) : ({ intent: "sell" as const, score: sell });
    if (pick.score > best.score) {
      best = {
        light: pick.score >= 80 ? "green" : pick.score >= 55 ? "yellow" : "red",
        score: pick.score,
        intent: pick.intent,
        headline: "",
        detail: "",
        symbol: sig.symbol,
      };
    }
  }

  if (!book.armed) {
    return { ...best, light: "red", score: 0, intent: "none", headline: "No va a comprar", detail: "Roxy está en OFF." };
  }
  if (paperAtOpsCap(book) && !book.positions.length) {
    return { ...best, light: "red", score: 0, intent: "none", headline: "No va a comprar", detail: "Llegó al tope de operaciones del presupuesto." };
  }
  if (paperAtDayCap(book) && !book.positions.length) {
    return { ...best, light: "red", score: 0, intent: "none", headline: "No va a comprar", detail: "Llegó al tope de operaciones del día." };
  }
  if (book.positions.length && best.symbol && book.positions.some((p) => p.symbol === best.symbol)) {
    const pos = book.positions.find((p) => p.symbol === best.symbol)!;
    return {
      ...best,
      light: "yellow",
      headline: pos.side === "long" ? "Ya compró · gestiona" : "Ya vendió · gestiona",
      detail: "No abre otra en este par hasta cerrar.",
    };
  }

  const name = best.symbol.replace("USDT", "");
  if (best.intent === "buy") {
    if (best.score >= 80) {
      best.headline = "Por comprar";
      best.detail = `${name}: alineación y confirmación listas. Indicador ${best.score}.`;
    } else if (best.score >= 55) {
      best.headline = "Casi compra";
      best.detail = `${name}: se está armando. Todavía no entra. Indicador ${best.score}.`;
    } else {
      best.headline = "No va a comprar";
      best.detail = `${name}: no hay disparo de compra. Indicador ${best.score}.`;
    }
  } else if (best.intent === "sell") {
    if (best.score >= 80) {
      best.headline = "Por vender";
      best.detail = `${name}: sesgo de venta maduro. Indicador ${best.score}.`;
    } else if (best.score >= 55) {
      best.headline = "Casi vende";
      best.detail = `${name}: se arma venta, aún no. Indicador ${best.score}.`;
    } else {
      best.headline = "No va a comprar";
      best.detail = `Tampoco vende con fuerza. Indicador ${best.score}.`;
    }
  } else {
    best.headline = "No va a comprar";
    best.detail = "Sin sesgo de entrada.";
  }
  best.light = best.score >= 80 ? "green" : best.score >= 55 ? "yellow" : "red";
  return best;
}

export function splitPaperTrades(book: PaperBook): { open: PaperTrade[]; closed: PaperTrade[] } {
  const open: PaperTrade[] = [];
  const closed: PaperTrade[] = [];
  for (const t of book.trades) {
    if (t.status === "open") open.push(t);
    else closed.push(t);
  }
  open.sort((a, b) => b.openedAt - a.openedAt);
  closed.sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt));
  return { open, closed };
}

function neededConfirm(interval: string, style: PaperStyle = "intraday"): number {
  if (style === "swing") {
    if (interval === "240" || interval === "D") return 1;
    return 2;
  }
  const b = scalpBand(interval);
  if (b === "ultra") return 3;
  if (b === "fast" || b === "mid" || b === "hour") return 2;
  return 99;
}

function pushFill(book: PaperBook, fill: Omit<PaperFill, "id">): void {
  book.fills = [{ ...fill, id: `${fill.at}-${Math.random().toString(16).slice(2, 8)}` }, ...book.fills].slice(0, FILLS);
}

function applyOpen(book: PaperBook, qtySigned: number, price: number, lev: PaperLev): number {
  const abs = Math.abs(qtySigned);
  const notional = abs * price;
  const margin = notional / lev;
  const fee = notional * FEE;
  book.cashUsd -= margin + fee;
  return margin;
}

function applyCloseQty(book: PaperBook, pos: PaperPosition, qtySigned: number, price: number): number {
  const abs = Math.abs(qtySigned);
  const posAbs = Math.abs(pos.qty) || abs;
  const frac = Math.min(1, abs / posAbs);
  const marginPart = (pos.marginUsd || abs * pos.entry / clampPaperLev(pos.leverage ?? 1)) * frac;
  const pnl = qtySigned * (price - pos.entry) - abs * (pos.entry + price) * FEE;
  book.cashUsd += marginPart + pnl;
  pos.marginUsd = Math.max(0, (pos.marginUsd || 0) * (1 - frac));
  return pnl;
}

function markHist(book: PaperBook, marks: Record<string, number>): void {
  const eq = paperEquity(book, marks);
  book.equityHist = [...book.equityHist, eq].slice(-HIST);
  if (eq > book.peakUsd) book.peakUsd = eq;
}

function canEnter(sig: BtcTradeSignal, side: "long" | "short", book: PaperBook): boolean {
  const minConf = paperMinConfOf(book);
  const style = paperStyleOf(book);
  if (!paperAllowsOpen(sig.interval, style)) return false;
  if (sig.confidence < minConf) return false;
  if (side === "long" && sig.rsi >= 76) return false;
  if (side === "short" && sig.rsi <= 24) return false;
  if (side === "long" && sig.ichiCloud === "below") return false;
  if (side === "short" && sig.ichiCloud === "above") return false;
  if (Number.isFinite(sig.volRatio) && (sig.volRatio ?? 1) < 0.82) return false;
  const plan = entryPlan(sig, side, style);
  const dist = Math.abs(sig.price - plan.stop);
  const minStop = style === "swing" ? 0.003 : 0.0009;
  if (!(dist > 0) || dist / sig.price < minStop) return false;
  return true;
}

function sizeQty(book: PaperBook, sig: BtcTradeSignal, side: "long" | "short", marks: Record<string, number>, stopPx = sig.stop): number {
  const lev = paperEffectiveLev(book.mode ?? "all", book.leverage ?? 1);
  const eq = Math.max(1, paperEquity(book, { ...marks, [sig.symbol]: sig.price }));
  const dist = Math.abs(sig.price - stopPx);
  if (!(dist > 0)) return 0;
  const riskUsd = eq * (clampPaperRiskPct(book.riskPct ?? DEFAULT_RISK_PCT) / 100);
  const qtyRisk = riskUsd / dist;
  const qtySize = (eq * (clampPaperSizePct(book.sizePct ?? DEFAULT_SIZE_PCT) / 100) * lev) / sig.price;
  const maxQty = (book.cashUsd * CASH_CAP * lev) / sig.price;
  const qty = Math.min(qtyRisk, qtySize, maxQty);
  if (!(qty > 0) || qty * sig.price < 25) return 0;
  return side === "long" ? qty : -qty;
}

export function resetPaperBook(
  initialUsd: number,
  universe: PaperUniverse = "ALL",
  maxOps = DEFAULT_MAX_OPS,
  mode: PaperMode = "all",
  leverage: PaperLev = 1,
): PaperBook {
  return emptyPaperBook(initialUsd, universe, maxOps, mode, leverage);
}

function shouldTick(book: PaperBook, symbol: string): boolean {
  if (book.universe === "ALL") return true;
  if (book.universe === symbol) return true;
  return book.positions.some((p) => p.symbol === symbol);
}

function findTrade(book: PaperBook, id: string): PaperTrade | undefined {
  return book.trades.find((t) => t.id === id);
}

function closeTrade(book: PaperBook, pos: PaperPosition, at: number, price: number, reason: string, pnl: number): void {
  const t = findTrade(book, pos.id);
  if (!t) {
    const created = tradeFromPosition(pos);
    created.status = "closed";
    created.qtyLeft = 0;
    created.closedAt = at;
    created.exit = price;
    created.exitReason = reason;
    created.realizedPnl = pnl;
    book.trades = [created, ...book.trades].slice(0, TRADES);
    return;
  }
  t.qtyLeft = 0;
  t.stop = pos.stop;
  t.t1Done = pos.t1Done;
  t.closedAt = at;
  t.exit = price;
  t.exitReason = reason;
  t.realizedPnl += pnl;
  t.status = "closed";
}

export function tickPaper(
  book: PaperBook,
  sig: BtcTradeSignal,
  opts?: { skipHist?: boolean; marks?: Record<string, number> },
): { book: PaperBook; events: PaperEvent[] } {
  const events: PaperEvent[] = [];
  if (!shouldTick(book, sig.symbol)) return { book, events };

  const next: PaperBook = {
    ...book,
    fills: [...book.fills],
    equityHist: [...book.equityHist],
    positions: book.positions.map((p) => ({ ...p })),
    trades: book.trades.map((t) => ({ ...t })),
    confirms: { ...book.confirms },
  };
  const px = sig.price;
  const now = Date.now();
  const fire = sig.bias === "buy" || sig.bias === "sell" ? sig.bias : "wait";
  const prev = next.confirms[sig.symbol] ?? { fire: "wait" as const, n: 0 };
  const n = fire === prev.fire && fire !== "wait" ? prev.n + 1 : fire === "wait" ? 0 : 1;
  next.confirms[sig.symbol] = { fire, n };

  const pos = next.positions.find((p) => p.symbol === sig.symbol);
  if (pos) {
    const long = pos.qty > 0;
    const hitStop = long ? px <= pos.stop : px >= pos.stop;
    const hitT2 = long ? px >= pos.t2 : px <= pos.t2;
    const hitT1 = !pos.t1Done && (long ? px >= pos.t1 : px <= pos.t1);
    const need = neededConfirm(sig.interval, paperStyleOf(next));
    const flip = (long && fire === "sell" && n >= need) || (!long && fire === "buy" && n >= need);

    const dropPos = () => {
      next.positions = next.positions.filter((p) => p.symbol !== sig.symbol);
    };

    if (hitStop) {
      const pnl = applyCloseQty(next, pos, pos.qty, px);
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "close",
        reason: "stop",
        price: px,
        qty: pos.qty,
        pnl,
        note: `${sig.symbol} stop`,
      });
      events.push({ kind: "close", side: pos.side, symbol: sig.symbol, reason: "stop", price: px, pnl, note: `${sig.symbol} stop` });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      closeTrade(next, pos, now, px, "stop", pnl);
      dropPos();
      next.confirms[sig.symbol] = { fire: "wait", n: 0 };
    } else if (hitT2) {
      const pnl = applyCloseQty(next, pos, pos.qty, px);
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "close",
        reason: "t2",
        price: px,
        qty: pos.qty,
        pnl,
        note: `${sig.symbol} T2`,
      });
      events.push({ kind: "close", side: pos.side, symbol: sig.symbol, reason: "t2", price: px, pnl, note: `${sig.symbol} T2` });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      closeTrade(next, pos, now, px, "t2", pnl);
      dropPos();
    } else if (hitT1) {
      const t1Frac = clampPaperT1Pct(next.t1Pct ?? DEFAULT_T1_PCT) / 100;
      const part = pos.qty * t1Frac;
      const pnl = applyCloseQty(next, pos, part, px);
      pos.qty -= part;
      pos.t1Done = true;
      pos.stop = pos.entry;
      const t = findTrade(next, pos.id) ?? tradeFromPosition(pos);
      if (!findTrade(next, pos.id)) next.trades = [t, ...next.trades];
      t.qtyLeft = pos.qty;
      t.t1Done = true;
      t.t1At = now;
      t.t1Price = px;
      t.t1Pnl = pnl;
      t.realizedPnl += pnl;
      t.stop = pos.stop;
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "scale",
        reason: "t1",
        price: px,
        qty: part,
        pnl,
        note: `${sig.symbol} T1`,
      });
      events.push({ kind: "scale", side: pos.side, symbol: sig.symbol, reason: "t1", price: px, pnl, note: `${sig.symbol} T1` });
      if (pnl >= 0) next.wins += 1;
    } else if (flip) {
      const pnl = applyCloseQty(next, pos, pos.qty, px);
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "close",
        reason: "flip",
        price: px,
        qty: pos.qty,
        pnl,
        note: `${sig.symbol} sesgo`,
      });
      events.push({ kind: "close", side: pos.side, symbol: sig.symbol, reason: "flip", price: px, pnl, note: `${sig.symbol} sesgo` });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      closeTrade(next, pos, now, px, "flip", pnl);
      dropPos();
    } else if (paperStyleOf(next) !== "swing" && now - pos.openedAt >= scalpMaxHoldMs(pos.interval || sig.interval)) {
      const pnl = applyCloseQty(next, pos, pos.qty, px);
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "close",
        reason: "time",
        price: px,
        qty: pos.qty,
        pnl,
        note: `${sig.symbol} tiempo scalp`,
      });
      events.push({ kind: "close", side: pos.side, symbol: sig.symbol, reason: "time", price: px, pnl, note: `${sig.symbol} tiempo` });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      closeTrade(next, pos, now, px, "time", pnl);
      dropPos();
    } else if (paperStyleOf(next) !== "swing" && uruguayDayKey(pos.openedAt) !== uruguayDayKey(now)) {
      const pnl = applyCloseQty(next, pos, pos.qty, px);
      pushFill(next, {
        at: now,
        symbol: sig.symbol,
        side: pos.side,
        action: "close",
        reason: "day",
        price: px,
        qty: pos.qty,
        pnl,
        note: `${sig.symbol} cierre de día`,
      });
      events.push({ kind: "close", side: pos.side, symbol: sig.symbol, reason: "day", price: px, pnl, note: `${sig.symbol} día` });
      if (pnl >= 0) next.wins += 1;
      else next.losses += 1;
      closeTrade(next, pos, now, px, "day", pnl);
      dropPos();
    } else if (long && Number.isFinite(sig.supertrend) && sig.supertrendDir === 1 && sig.supertrend > pos.stop && sig.supertrend < px) {
      pos.stop = Math.max(pos.stop, sig.supertrend);
      const t = findTrade(next, pos.id);
      if (t) t.stop = pos.stop;
    } else if (!long && Number.isFinite(sig.supertrend) && sig.supertrendDir === -1 && sig.supertrend < pos.stop && sig.supertrend > px) {
      pos.stop = Math.min(pos.stop, sig.supertrend);
      const t = findTrade(next, pos.id);
      if (t) t.stop = pos.stop;
    }
  }

  const hasPos = next.positions.some((p) => p.symbol === sig.symbol);
  const underCap = paperCanOpen(next, now);
  const mode = normalizePaperMode(next.mode);
  const lev = paperEffectiveLev(mode, next.leverage ?? 1);
  if (next.armed && underCap && !hasPos && (fire === "buy" || fire === "sell") && n >= neededConfirm(sig.interval, paperStyleOf(next))) {
    const side = fire === "buy" ? "long" : "short";
    if (paperAllowsSide(mode, side) && paperAllowsOpen(sig.interval, paperStyleOf(next)) && canEnter(sig, side, next)) {
      const marks = { ...(opts?.marks ?? {}), [sig.symbol]: px };
      const plan = entryPlan(sig, side, paperStyleOf(next));
      const qty = sizeQty(next, sig, side, marks, plan.stop);
      if (qty !== 0) {
        const marginUsd = applyOpen(next, qty, px, lev);
        const id = `${now}-${sig.symbol}`;
        const opened: PaperPosition = {
          id,
          side,
          symbol: sig.symbol,
          interval: sig.interval,
          qty,
          entry: px,
          stop: plan.stop,
          t1: plan.t1,
          t2: plan.t2,
          t1Done: false,
          openedAt: now,
          leverage: lev,
          venue: paperVenueOf(mode),
          marginUsd,
        };
        next.positions.push(opened);
        next.opsUsed += 1;
        next.trades = [tradeFromPosition(opened), ...next.trades].slice(0, TRADES);
        pushFill(next, {
          at: now,
          symbol: sig.symbol,
          side,
          action: "open",
          reason: "signal",
          price: px,
          qty,
          note: `${sig.symbol} ${sig.confidence}%`.slice(0, 120),
        });
        events.push({
          kind: "open",
          side,
          symbol: sig.symbol,
          reason: "signal",
          price: px,
          note: `${side === "long" ? "LARGO" : "CORTO"} ${sig.symbol}`,
        });
      }
    }
  }

  if (!opts?.skipHist) markHist(next, { ...(opts?.marks ?? {}), [sig.symbol]: px });
  return { book: next, events };
}

export function tickPaperMany(book: PaperBook, signals: BtcTradeSignal[]): { book: PaperBook; events: PaperEvent[] } {
  const marks: Record<string, number> = {};
  for (const s of signals) marks[s.symbol] = s.price;
  let cur = book;
  const events: PaperEvent[] = [];
  for (const sig of signals) {
    const r = tickPaper(cur, sig, { skipHist: true, marks });
    cur = r.book;
    events.push(...r.events);
  }
  markHist(cur, marks);
  return { book: cur, events };
}

function ivTalk(iv: string): string {
  const m: Record<string, string> = {
    "1s": "1 segundo",
    LIVE: "tiempo real",
    "1": "1 minuto",
    "5": "5 minutos",
    "15": "15 minutos",
    "30": "30 minutos",
    "60": "1 hora",
    "240": "4 horas",
    D: "1 día",
  };
  return m[iv] ?? (iv || "este gráfico");
}

function usdTalk(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function voiceHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function say(seed: string, lines: string[]): string {
  return lines[voiceHash(seed) % lines.length]!;
}

function cloudTalk(seed: string, c: BtcTradeSignal["ichiCloud"]): string {
  if (c === "above") {
    return say(seed + "c", [
      "precio arriba de la nube: el piso al menos tiene educación",
      "sobre la nube, que no es lo mismo que sobre una alfombra roja",
      "la nube nos sostiene; yo no me confío, pero tampoco me hago la ciega",
    ]);
  }
  if (c === "below") {
    return say(seed + "c", [
      "debajo de la nube: el techo nos está mirando feo",
      "nube arriba, ánimo abajo. Clásico",
      "estamos debajo; si alguien grita 'rebote mágico', yo me tapo los oídos",
    ]);
  }
  if (c === "inside") {
    return say(seed + "c", [
      "metidos en la nube, esa niebla donde todo el mundo se vuelve experto",
      "dentro de la nube: zona de 'a ver qué pasa', mi deporte menos favorito",
      "la nube nos tragó. Mientras no salga, yo no firmo cheques",
    ]);
  }
  return "la nube está en modo misterio";
}

function rsiTalk(seed: string, rsi: number): string {
  const n = rsi.toFixed(0);
  if (rsi >= 76) {
    return say(seed + "r", [
      `RSI ${n}: ya está en modo selfie. Perseguir esto es pagarle el café al vendedor`,
      `RSI ${n}, estiradísimo. Si compro ahora, mañana me escribo una carta de disculpas`,
    ]);
  }
  if (rsi >= 68) {
    return say(seed + "r", [
      `RSI ${n}: hay fuerza, y también hay gente llegando tarde a la fiesta`,
      `RSI ${n}, momentum de verdad, no de PowerPoint. Aun así no corro`,
    ]);
  }
  if (rsi <= 24) {
    return say(seed + "r", [
      `RSI ${n}: el piso está haciendo teatro. Vender más acá es patear a un caído`,
      `RSI ${n}, oversold de manual. Los héroes entran acá; yo espero que deje de sangrar`,
    ]);
  }
  if (rsi <= 32) {
    return say(seed + "r", [
      `RSI ${n}: hay presión vendedora, no pánico de película`,
      `RSI ${n}, el mercado está de mal humor. Lo respeto`,
    ]);
  }
  return say(seed + "r", [
    `RSI ${n}, zona civilizada. Ni euforia ni funeral`,
    `RSI ${n}: equilibrado, aburrido, exactamente como me gusta para pensar`,
  ]);
}

function reasonTalk(reason: string): string {
  if (reason === "stop") return "el stop";
  if (reason === "t2") return "el objetivo 2";
  if (reason === "t1") return "el objetivo 1";
  if (reason === "flip") return "un giro de sesgo";
  return reason;
}

export function pushPaperNote(book: PaperBook, note: Omit<PaperNote, "id">): PaperBook {
  const last = book.notes[0];
  const same = last && last.fingerprint === note.fingerprint;
  const fresh = last && note.at - last.at < 75_000;
  if (same && fresh) {
    const updated: PaperNote = { ...last, at: note.at, title: note.title, body: note.body };
    return { ...book, notes: [updated, ...book.notes.slice(1)] };
  }
  const full: PaperNote = {
    ...note,
    id: `${note.at}-${Math.random().toString(16).slice(2, 8)}`,
  };
  return { ...book, notes: [full, ...(book.notes ?? [])].slice(0, NOTES) };
}

export function narratePaper(
  book: PaperBook,
  signals: BtcTradeSignal[],
  events: PaperEvent[],
  tag: (symbol: string) => string,
): Omit<PaperNote, "id"> {
  const at = Date.now();
  const beat = Math.floor(at / 80_000);
  const left = paperOpsLeft(book);
  const atCap = paperAtOpsCap(book);
  const focused =
    book.universe === "ALL"
      ? signals
      : signals.filter((s) => s.symbol === book.universe || book.positions.some((p) => p.symbol === s.symbol));
  const view = focused.length ? focused : signals;
  const buys = [...view.filter((s) => s.bias === "buy")].sort((a, b) => b.confidence - a.confidence);
  const sells = [...view.filter((s) => s.bias === "sell")].sort((a, b) => b.confidence - a.confidence);
  const waits = view.filter((s) => s.bias === "wait");
  const lead = [...view].sort((a, b) => b.confidence - a.confidence)[0];
  const iv = ivTalk(view[0]?.interval ?? "");
  const seed = `${beat}|${book.universe}|${lead?.symbol ?? ""}|${lead?.bias ?? "x"}|${book.armed ? 1 : 0}|${book.positions.length}`;
  const paras: string[] = [];
  const planName = lead ? tag(lead.symbol) : "el mercado";

  for (const ev of events) {
    const name = tag(ev.symbol);
    if (ev.kind === "open") {
      paras.push(
        say(seed + ev.symbol + "o", [
          `Listo: entré ${ev.side === "long" ? "larga" : "corta"} en ${name} a ${usdTalk(ev.price)}. No fue un capricho; riesgo 1% y el mapa (stop, T1, T2) ya está clavado.`,
          `Abrí ${name}. Si alguien esperaba un discurso motivacional, mal: esto es ejecución. Precio ${usdTalk(ev.price)}, yo adentro, drama afuera.`,
          `${name} me convenció lo justo. Entro, marco el stop y me callo. El mercado ya habló de más.`,
        ]),
      );
    } else if (ev.kind === "scale") {
      paras.push(
        say(seed + ev.symbol + "sc", [
          `T1 en ${name}: cobré la mitad y el stop se mudó a la entrada. El resto puede lucirse o irse; yo ya no regalo esa plata.`,
          `${name} me pagó un adelanto. Saqué 50%, puse el stop en casa y ahora el trade trabaja para no volverme loca.`,
        ]),
      );
    } else {
      const pnl = ev.pnl ?? 0;
      const signed = `${pnl >= 0 ? "+" : ""}${usdTalk(pnl)}`;
      paras.push(
        say(seed + ev.symbol + "cl", [
          `Cerré ${name} por ${reasonTalk(ev.reason)} a ${usdTalk(ev.price)} (${signed}). Fin del capítulo. No voy a perseguir el mismo chiste.`,
          `${name} se acabó: ${reasonTalk(ev.reason)}, ${signed}. Respiro. El siguiente trade se gana esperando, no insistiendo.`,
        ]),
      );
    }
  }

  let tone: PaperNoteTone = "idle";
  let title = say(seed + "t0", ["Mirando el circo", "El mercado se hace el interesante", "Estoy leyendo el cuarto"]);

  if (!view.length) {
    paras.push(
      say(seed + "empty", [
        "Todavía no me llega una lectura. Puedo inventar una opinión, claro. Prefiero no.",
        "Pantalla en blanco, cerebro en standby. En cuanto haya confluencia, hablo.",
      ]),
    );
  } else if (book.universe === "ALL") {
    const board =
      buys.length || sells.length
        ? [
            buys.length ? `Compra: ${buys.map((s) => `${tag(s.symbol)} ${s.confidence.toFixed(0)}%`).join(", ")}.` : "",
            sells.length ? `Venta: ${sells.map((s) => `${tag(s.symbol)} ${s.confidence.toFixed(0)}%`).join(", ")}.` : "",
            waits.length
              ? say(seed + "w", [
                  `${waits.map((s) => tag(s.symbol)).join(", ")} están en modo «después te llamo».`,
                  `El resto bosteza: ${waits.map((s) => tag(s.symbol)).join(", ")}.`,
                ])
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : say(seed + "none", [
            `En ${iv} ninguna se anima a un COMPRAR o VENDER limpio. Qué talento para no decidir.`,
            `Seis pares y cero convicción. Hoy el mercado está ensayando, no estrenando.`,
            `Nada limpio. Si esto fuera una cita, yo ya estaría pidiendo la cuenta.`,
          ]);
    paras.push(say(seed + "all", [`Tablero de ${iv}. ${board}`, `Estoy recorriendo las seis en ${iv}. ${board}`]));
    if (lead && (lead.bias === "buy" || lead.bias === "sell")) {
      paras.push(
        say(seed + "lead", [
          `La que más ruido hace es ${tag(lead.symbol)} (${lead.confidence.toFixed(0)}%): ${cloudTalk(seed, lead.ichiCloud)}. ${rsiTalk(seed, lead.rsi)}. Supertrend ${lead.supertrendDir === 1 ? "alcista" : "bajista"}.`,
          `${tag(lead.symbol)} se cree protagonista al ${lead.confidence.toFixed(0)}%. ${cloudTalk(seed, lead.ichiCloud)}. ${rsiTalk(seed, lead.rsi)}. Yo la miro de reojo, no le firmo un contrato.`,
        ]),
      );
    }
  } else {
    const s = view.find((x) => x.symbol === book.universe) ?? view[0];
    if (s) {
      const name = tag(s.symbol);
      const need = neededConfirm(s.interval);
      const conf = book.confirms[s.symbol];
      const mood =
        s.bias === "buy"
          ? say(seed + "mb", ["olor a compra, no a desfile", "sesgo comprador, todavía no es un sí", "el lado largo se está acomodando"])
          : s.bias === "sell"
            ? say(seed + "ms", ["cara de venta, no de funeral", "el lado corto levanta la mano", "presión bajista, sin teatralidad"])
            : say(seed + "mw", ["ni compra ni venta: el clásico «después vemos»", "el par se hace el misterioso", "cero disparo, mucha pose"]);
      paras.push(
        `${name} en ${ivTalk(s.interval)}: ${mood}. Alineación ${s.confidence.toFixed(0)}%. ${cloudTalk(seed, s.ichiCloud)}. ${rsiTalk(seed, s.rsi)}. Supertrend ${s.supertrendDir === 1 ? "alcista" : "bajista"}.`,
      );
      if (s.bias !== "wait" && conf) {
        if (conf.fire !== s.bias) {
          paras.push(
            say(seed + "flip", [
              "El sesgo cambió de camiseta. Reinicio el conteo. No persigo traiciones.",
              "Acaba de girar. Gracias por el show: yo vuelvo a contar desde cero.",
            ]),
          );
        } else {
          paras.push(
            conf.n >= need
              ? say(seed + "ripe", [
                  `Confirmaciones ${Math.min(conf.n, need)}/${need}. Está maduro. Si las reglas me dejan, actúo; si no, me muerdo la lengua.`,
                  `${Math.min(conf.n, need)} de ${need}: ya no es un capricho. Ahora es decisión.`,
                ])
              : say(seed + "waitc", [
                  `Llevo ${Math.min(conf.n, need)} de ${need} confirmaciones. Me falta que se sostenga, no que me convenzan con un candle heroico.`,
                  `${Math.min(conf.n, need)}/${need}. Todavía puede ser un amague. Yo no aprieto por aburrimiento.`,
                ]),
          );
        }
      }
    }
  }

  for (const pos of book.positions) {
    const s = view.find((x) => x.symbol === pos.symbol);
    const px = s?.price ?? pos.entry;
    const u = pos.qty * (px - pos.entry);
    const name = tag(pos.symbol);
    const uTxt = `${u >= 0 ? "+" : ""}${usdTalk(u)}`;
    paras.push(
      say(seed + pos.id, [
        `${name} sigue ${pos.side === "long" ? "larga" : "corta"} desde ${usdTalk(pos.entry)}, ahora ${usdTalk(px)} (${uTxt}). Stop ${usdTalk(pos.stop)}${pos.t1Done ? ". T1 ya cobrado; el resto vive de prestado." : `; T1 en ${usdTalk(pos.t1)}, sin adelantarme.`} Plan: no agrando, no promedio, no rezo.`,
        `Gestión de ${name}: ${uTxt} flotando. El stop es la niñera. ${pos.t1Done ? "Ya saqué mitad." : `Si llega a ${usdTalk(pos.t1)}, cobro 50% y me pongo cómoda.`}`,
      ]),
    );
  }

  const readyBuy = buys.find((s) => s.confidence >= MIN_CONF);

  if (!book.armed) {
    tone = "pause";
    title = say(seed + "tp", ["Me dejaron el mute", "OFF: yo miro, no gasto", "Pausa con palomitas"]);
    paras.push(
      say(seed + "off", [
        "Estoy en OFF. Puedo opinar, no puedo disparar. Si hay algo abierto, lo cuido; si no, soy comentarista paga en palomitas.",
        "Me apagaron. Perfecto: así no firmo locuras. El plan es mirar y morderse la lengua.",
      ]),
    );
  } else if (atCap && !book.positions.length) {
    tone = "cap";
    title = say(seed + "tc", ["Cupo lleno, show cerrado", "Tope: me quedé afuera", "Sin fichas, con opinión"]);
    paras.push(
      say(seed + "cap0", [
        `Gasté las ${book.maxOps} operaciones. Sigo teniendo opiniones (gratis, abundantes). Entradas: cero hasta que subas el tope o reinicies.`,
        "Tope alcanzado. El mercado puede hacer lo que quiera; yo ya jugué mi mano.",
      ]),
    );
  } else if (atCap) {
    tone = "cap";
    title = say(seed + "tg", ["Solo hago de niñera", "Sin entradas nuevas", "Gestiono, no invento"]);
    paras.push("El cupo está lleno. Plan: cuidar lo abierto, respetar el stop y fingir que no veo oportunidades de último minuto.");
  } else if (events.some((e) => e.kind === "open")) {
    tone = "open";
    title = say(seed + "to", ["Ya está, entré", "Operación en curso", "Dejé de mirar: ejecuté"]);
    paras.push(
      say(seed + "po", [
        "Plan ahora: no toco el stop en contra, no agrego porque va. Si corre, T1 al 50% y el resto a T2. Si se da vuelta, el stop habla por mí.",
        "Autonomía de verdad: la orden ya voló. Yo me siento, el plan trabaja. Interferir ahora sería vanidad.",
      ]),
    );
  } else if (events.some((e) => e.kind === "scale")) {
    tone = "adjust";
    title = say(seed + "ta", ["Me pagué el nervio", "T1 hecho, ego en jaula", "Ahora sí puedo ser paciente"]);
    paras.push("El trade ya se autofinanció. Dejo el resto con stop en entrada. Si el sesgo se da vuelta con confirmación, salgo sin drama.");
  } else if (events.some((e) => e.kind === "close")) {
    tone = "close";
    title = say(seed + "tx", ["Cerré y respiro", "Capítulo cerrado", "Plata contada, ego a dieta"]);
    paras.push(
      left > 0
        ? say(seed + "pc", [
            `Quedan ${left} tiro${left === 1 ? "" : "s"} en el tope. No reingreso al mismo movimiento. Quiero 58%+, confirmación en ${iv}, y que no sea un RSI de revista.`,
            `Cerrado. Me quedan ${left}. Plan: paciencia agresiva. Si el mercado insiste con ruido, yo insisto con no hacer nada.`,
          ])
        : "Tope seco. Aplausos, palomitas, y nada de una más.",
    );
  } else if (book.positions.length) {
    tone = "hold";
    title = say(seed + "th", [
      book.positions.length > 1 ? "Sostengo el inventario" : "Sostengo y no toco",
      "Estoy adentro: ahora manda el plan",
      "Niñera de stop, no de ego",
    ]);
    paras.push(
      say(seed + "ph", [
        "No voy a mejorar una posición que ya existe. Stop trabaja, T1 escala, T2 cierra. Solo subo el stop si el Supertrend me regala trail a favor.",
        "Pensando en voz alta: no abro otra en el mismo par. Una idea, una apuesta. El resto es comentario de café.",
      ]),
    );
  } else if (buys.length || sells.length) {
    tone = "watch";
    const hot = readyBuy ?? buys[0] ?? sells[0]!;
    const goingBuy = hot.bias === "buy";
    title = say(seed + "tw", [
      goingBuy ? "Huele a compra. No corro" : "Huele a venta. Tampoco corro",
      goingBuy ? `${tag(hot.symbol)} me guiña. Yo cuento` : `${tag(hot.symbol)} quiere corto. Yo freno`,
      "Hay sesgo. Hay orgullo. Falta el clic",
    ]);
    paras.push(
      say(seed + "pw", [
        goingBuy
          ? `Pienso comprar ${tag(hot.symbol)} si se confirma en ${iv} y no se desarma. Alineación ${hot.confidence.toFixed(0)}% (piso ${MIN_CONF}). Si el RSI se pone ridículo o la nube nos escupe, cancelo sin avisarle al ego.`
          : `Pienso ir corta en ${tag(hot.symbol)} con las mismas reglas: confirmación, ${MIN_CONF}%+, stop primero. No vendo porque se ve feo. Se ve feo todo el día.`,
        `Autonomía: ${planName} es mi candidata, el resto es ruido de pasillo. No opero las seis por deporte. Una lectura limpia o nada.`,
      ]),
    );
  } else {
    tone = "idle";
    title = say(seed + "ti", ["Hoy no firmo locuras", "Sin disparo, con criterio", "El plan es no tener plan de entrada"]);
    paras.push(
      say(seed + "pi", [
        `Nada que merezca una orden. ${planName} no me convence. Prefiero quedar como aburrida que como arrepentida.`,
        `El mercado está moviendo las cejas y llamándolo tendencia. Yo no pico. En ${iv} quiero un COMPRAR/VENDER limpio o me quedo con las manos en los bolsillos.`,
      ]),
    );
  }

  if (book.armed && !atCap && !events.length) {
    paras.push(
      book.opsUsed === 0
        ? say(seed + "ops0", [
            `Tope intacto: ${book.maxOps} operaciones si el mercado se porta. Mientras, yo decido sola: no hay entra que se va.`,
            `Tengo ${book.maxOps} tiros. Los gasto como si fueran míos, porque lo son.`,
          ])
        : say(seed + "opsn", [
            `Voy ${book.opsUsed}/${book.maxOps}. Me quedan ${left}. No las gasto en un amague de ${planName}.`,
            `${left} operación${left === 1 ? "" : "es"} en el bolsillo. Autonomía: si no está limpio, no está.`,
          ]),
    );
  }

  const body = paras.filter(Boolean).join("\n");
  const fingerprint = [
    tone,
    String(beat),
    book.armed ? "on" : "off",
    book.universe,
    String(book.maxOps),
    String(book.opsUsed),
    book.positions.map((p) => `${p.id}:${p.t1Done ? "t1" : "open"}`).join(","),
    view.map((s) => `${s.symbol}:${s.bias}:${Math.round(s.confidence / 5) * 5}`).join("|"),
    events.map((e) => e.kind + e.symbol).join(","),
  ].join("/");

  return { at, tone, title, body, fingerprint };
}
