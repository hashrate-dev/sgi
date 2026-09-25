import type { BtcTradeSignal } from "./api";

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

export type PaperStyle = "auto" | "intraday" | "swing";
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
  opsUsed: number;
  mode: PaperMode;
  leverage: PaperLev;
  runInterval: string;
  riskPct: number;
  sizePct: number;
  minConf: number;
  t1Pct: number;
  style: PaperStyle;
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

export function paperMinConfOf(book: PaperBook): number {
  return clampPaperMinConf(book.minConf ?? MIN_CONF);
}

export function normalizePaperStyle(raw: unknown): PaperStyle {
  if (raw === "swing" || raw === "intraday" || raw === "auto") return raw;
  return "auto";
}

export function paperStyleOf(book: Pick<PaperBook, "style"> | { style?: unknown }): PaperStyle {
  return normalizePaperStyle(book.style);
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
    opsUsed: 0,
    mode: md,
    leverage: paperEffectiveLev(md, leverage),
    runInterval: "60",
    riskPct: DEFAULT_RISK_PCT,
    sizePct: DEFAULT_SIZE_PCT,
    minConf: MIN_CONF,
    t1Pct: DEFAULT_T1_PCT,
    style: "auto" as PaperStyle,
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
    maxOps: clampPaperMaxOps(parsed.maxOps ?? DEFAULT_MAX_OPS),
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
    if (align < paperMinConfOf(book)) s = Math.min(s, 50);
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
    return { ...best, light: "red", score: 0, intent: "none", headline: "No va a comprar", detail: "Llegó al tope de operaciones." };
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

export type PaperPrep = {
  pct: number;
  stage: string;
  symbol: string;
  intent: "buy" | "sell" | "none" | "hold";
};

export function paperPrepProcess(book: PaperBook, signals: BtcTradeSignal[]): PaperPrep {
  const mode = normalizePaperMode(book.mode);
  const minC = paperMinConfOf(book);
  const style = paperStyleOf(book);
  const view =
    book.universe === "ALL"
      ? signals
      : signals.filter((s) => s.symbol === book.universe || book.positions.some((p) => p.symbol === s.symbol));

  if (!book.armed) return { pct: 0, stage: "Pausada · no prepara", symbol: "", intent: "none" };
  if (paperAtOpsCap(book) && !book.positions.length) {
    return { pct: 0, stage: "Tope · no hay próxima op", symbol: "", intent: "none" };
  }
  if (book.positions.length) {
    const p = book.positions[0]!;
    return {
      pct: 100,
      stage: p.t1Done ? `Gestionando ${p.symbol.replace("USDT", "")} · T1 hecho, corre a T2` : `En operación ${p.symbol.replace("USDT", "")} · stop y T1 activos`,
      symbol: p.symbol,
      intent: "hold",
    };
  }
  if (!view.length) return { pct: 1, stage: "Esperando lectura", symbol: "", intent: "none" };

  let best = { pct: 1, symbol: "", intent: "none" as "buy" | "sell" | "none", stage: "Mirando el tablero" };
  for (const sig of view) {
    const side: "buy" | "sell" | null = sig.bias === "buy" || sig.bias === "sell" ? sig.bias : null;
    if (!side) continue;
    if (!paperAllowsSide(mode, side === "buy" ? "long" : "short")) continue;
    const need = Math.max(1, neededConfirm(sig.interval, style));
    const c = book.confirms[sig.symbol];
    const n = c && c.fire === side ? c.n : 0;
    const align = Math.max(0, Math.min(1, sig.confidence / minC));
    const confs = Math.max(0, Math.min(1, n / need));
    const rsiOk = side === "buy" ? sig.rsi < 76 : sig.rsi > 24;
    const cloudOk = side === "buy" ? sig.ichiCloud !== "below" : sig.ichiCloud !== "above";
    const volOk = !Number.isFinite(sig.volRatio) || (sig.volRatio ?? 1) >= 0.82;
    const filters = (rsiOk ? 0.34 : 0) + (cloudOk ? 0.34 : 0) + (volOk ? 0.32 : 0);
    let pct = Math.round(align * 42 + confs * 40 + filters * 18);
    if (!rsiOk || !cloudOk) pct = Math.min(pct, 72);
    if (align >= 1 && confs >= 1 && rsiOk && cloudOk && volOk) pct = 100;
    pct = Math.max(1, Math.min(100, pct));
    if (pct > best.pct) {
      let stage = "Leyendo mercado";
      if (pct >= 100) stage = `Lista · ${side === "buy" ? "compra" : "venta"} ${sig.symbol.replace("USDT", "")}`;
      else if (pct >= 82) stage = "Filtros finales · un paso de ejecutar";
      else if (pct >= 61) stage = `Confirmando velas ${Math.min(n, need)}/${need}`;
      else if (pct >= 41) stage = `Alineación ${sig.confidence.toFixed(0)}% (piso ${minC}%)`;
      else if (pct >= 21) stage = `Armando sesgo de ${side === "buy" ? "compra" : "venta"}`;
      best = { pct, symbol: sig.symbol, intent: side, stage };
    }
  }
  if (best.intent === "none") {
    return { pct: Math.max(1, Math.min(18, view.length ? 8 : 1)), stage: "Sin sesgo limpio · espera", symbol: "", intent: "none" };
  }
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

function neededConfirm(interval: string, style: PaperStyle = "auto"): number {
  let n = 1;
  if (interval === "1s" || interval === "LIVE" || interval === "1") n = 3;
  else if (interval === "5" || interval === "15") n = 2;
  if (style === "swing") n += 1;
  return n;
}

function isFastInterval(interval: string): boolean {
  return interval === "1s" || interval === "LIVE" || interval === "1" || interval === "5";
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
  if (sig.confidence < minConf) return false;
  if (style === "swing" && isFastInterval(sig.interval) && sig.confidence < Math.min(85, minConf + 12)) return false;
  if (side === "long" && sig.rsi >= 76) return false;
  if (side === "short" && sig.rsi <= 24) return false;
  if (side === "long" && sig.ichiCloud === "below") return false;
  if (side === "short" && sig.ichiCloud === "above") return false;
  if (Number.isFinite(sig.volRatio) && (sig.volRatio ?? 1) < 0.82) return false;
  const dist = Math.abs(sig.price - sig.stop);
  const minStop = style === "swing" && !isFastInterval(sig.interval) ? 0.003 : 0.0015;
  if (!(dist > 0) || dist / sig.price < minStop) return false;
  return true;
}

function sizeQty(book: PaperBook, sig: BtcTradeSignal, side: "long" | "short", marks: Record<string, number>): number {
  const lev = paperEffectiveLev(book.mode ?? "all", book.leverage ?? 1);
  const eq = Math.max(1, paperEquity(book, { ...marks, [sig.symbol]: sig.price }));
  const dist = Math.abs(sig.price - sig.stop);
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
    const need = neededConfirm(sig.interval);
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
  const underCap = next.opsUsed < next.maxOps;
  const mode = normalizePaperMode(next.mode);
  const lev = paperEffectiveLev(mode, next.leverage ?? 1);
  if (next.armed && underCap && !hasPos && (fire === "buy" || fire === "sell") && n >= neededConfirm(sig.interval)) {
    const side = fire === "buy" ? "long" : "short";
    if (paperAllowsSide(mode, side) && canEnter(sig, side, next)) {
      const marks = { ...(opts?.marks ?? {}), [sig.symbol]: px };
      const qty = sizeQty(next, sig, side, marks);
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
          stop: sig.stop,
          t1: sig.target1,
          t2: sig.target2,
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

type RoxyMood = "real" | "dry" | "fun";

function moodOf(seed: string): RoxyMood {
  const r = voiceHash(seed + "|mood") % 10;
  if (r <= 1) return "fun";
  if (r <= 4) return "dry";
  return "real";
}

function speak(
  seed: string,
  pack: { real: string[]; dry?: string[]; fun?: string[] },
  avoid?: string,
): string {
  const trySeed = (s: string) => {
    const mood = moodOf(s);
    const bank = (mood === "fun" && pack.fun?.length ? pack.fun : mood === "dry" && pack.dry?.length ? pack.dry : pack.real);
    return bank[voiceHash(s + mood) % bank.length]!;
  };
  const head = (avoid ?? "").slice(0, 40);
  let s = seed;
  for (let i = 0; i < 8; i++) {
    const t = trySeed(s);
    if (!head || !t.startsWith(head)) return t;
    s = `${seed}~${i}`;
  }
  return trySeed(s);
}

function cloudTalk(seed: string, c: BtcTradeSignal["ichiCloud"]): string {
  if (c === "above") {
    return speak(seed + "c", {
      real: ["precio sobre la nube: el régimen sigue alcista", "arriba de la nube, el piso técnico aguanta"],
      dry: ["sobre la nube, que no es lo mismo que sobre una alfombra roja", "la nube nos sostiene; yo no mando flores todavía"],
      fun: ["la nube nos hace de colchón. Linda, pero no es un all-inclusive"],
    });
  }
  if (c === "below") {
    return speak(seed + "c", {
      real: ["debajo de la nube: el régimen es bajista", "nube arriba, presión vendedora vigente"],
      dry: ["debajo de la nube el techo nos mira feo", "si alguien grita rebote mágico, me tapo los oídos"],
      fun: ["la nube nos dejó en seen. Clásico"],
    });
  }
  if (c === "inside") {
    return speak(seed + "c", {
      real: ["dentro de la nube: zona de duda, no hay régimen limpio", "nube adentro, espero que elija un lado"],
      dry: ["metidos en la niebla donde todo el mundo se vuelve experto", "la nube nos tragó; yo no firmo cheques en la bruma"],
      fun: ["estamos en la nube como en un ascensor con música rara: nadie habla y todos miran el precio"],
    });
  }
  return "la nube no está clara";
}

function rsiTalk(seed: string, rsi: number): string {
  const n = rsi.toFixed(0);
  if (rsi >= 76) {
    return speak(seed + "r", {
      real: [`RSI ${n}: sobrecompra. Perseguir acá rompe el plan de riesgo`],
      dry: [`RSI ${n} en modo selfie. Comprar ahora es pagarle el café al vendedor`],
      fun: [`RSI ${n}. Si esto fuera una fiesta, ya estarían sacando las sillas`],
    });
  }
  if (rsi >= 68) {
    return speak(seed + "r", {
      real: [`RSI ${n}: momentum alcista, cerca de saturarse`],
      dry: [`RSI ${n}, hay fuerza y también gente llegando tarde`],
      fun: [`RSI ${n}: el globo está lindo, yo no le pongo más aire con los dientes`],
    });
  }
  if (rsi <= 24) {
    return speak(seed + "r", {
      real: [`RSI ${n}: sobreventa extrema. No vendo más acá`],
      dry: [`RSI ${n}. Vender más es patear a un caído`],
      fun: [`RSI ${n}: el piso está haciendo teatro. Yo no aplaudo todavía`],
    });
  }
  if (rsi <= 32) {
    return speak(seed + "r", {
      real: [`RSI ${n}: hay presión vendedora`],
      dry: [`RSI ${n}, el mercado está de mal humor. Lo respeto`],
    });
  }
  return speak(seed + "r", {
    real: [`RSI ${n}: zona neutral, sirve para pensar`],
    dry: [`RSI ${n}, equilibrado y aburrido. Perfecto`],
    fun: [`RSI ${n}: ni euforia ni funeral. Hasta el oscilador se portó`],
  });
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
  const beat = Math.floor(at / 45_000);
  const left = paperOpsLeft(book);
  const atCap = paperAtOpsCap(book);
  const minC = paperMinConfOf(book);
  const risk = clampPaperRiskPct(book.riskPct ?? 1);
  const t1p = clampPaperT1Pct(book.t1Pct ?? 50);
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
  const lastHead = (book.notes[0]?.title ?? "") + (book.notes[0]?.body ?? "").slice(0, 24);
  const seed = `${beat}|${book.universe}|${lead?.symbol ?? ""}|${lead?.bias ?? "x"}|${Math.round((lead?.confidence ?? 0) / 3)}|${book.armed ? 1 : 0}|${book.positions.length}`;
  const paras: string[] = [];
  const planName = lead ? tag(lead.symbol) : "el mercado";

  for (const ev of events) {
    const name = tag(ev.symbol);
    if (ev.kind === "open") {
      paras.push(
        speak(seed + ev.symbol + "o", {
          real: [
            `Entré ${ev.side === "long" ? "larga" : "corta"} en ${name} a ${usdTalk(ev.price)}. Riesgo ${risk}% del equity, stop/T1/T2 marcados. El plan es no tocar el tamaño.`,
          ],
          dry: [
            `Abrí ${name} a ${usdTalk(ev.price)}. No hay discurso: hay mapa. Si corre, T1 ${t1p}% y el resto a T2.`,
          ],
          fun: [
            `${name} me convención lo justo y yo ya estoy adentro a ${usdTalk(ev.price)}. El stop hace de adulto responsable; yo hago de Roxy.`,
          ],
        }),
      );
    } else if (ev.kind === "scale") {
      paras.push(
        speak(seed + ev.symbol + "sc", {
          real: [`T1 en ${name}: cerré ${t1p}% y el stop pasó a la entrada. El resto puede ir a T2 o no; el riesgo ya no es el de arranque.`],
          dry: [`${name} me pagó un adelanto. Saqué ${t1p}%, stop en casa. Ahora el trade trabaja y yo no le mando memes.`],
          fun: [`T1 cobrado en ${name}. Mitad en el bolsillo, ego en la jaula. El resto que se luzca si quiere.`],
        }),
      );
    } else {
      const pnl = ev.pnl ?? 0;
      const signed = `${pnl >= 0 ? "+" : ""}${usdTalk(pnl)}`;
      paras.push(
        speak(seed + ev.symbol + "cl", {
          real: [`Cerré ${name} por ${reasonTalk(ev.reason)} a ${usdTalk(ev.price)} (${signed}). No persigo el mismo movimiento.`],
          dry: [`${name} se acabó: ${reasonTalk(ev.reason)}, ${signed}. Siguiente idea, no la misma con otro nombre.`],
          fun: [`Cortina para ${name} (${signed}). Aplausos cortos. El bis está prohibido por reglamento interno.`],
        }),
      );
    }
  }

  let tone: PaperNoteTone = "idle";
  let title = speak(
    seed + "t0",
    {
      real: ["Leyendo el flujo", "Confluencia en curso", "Estoy en el mapa"],
      dry: ["El mercado se hace el interesante", "Ruido con corbata", "Otra función de velas"],
      fun: ["Café y velas, mi deporte", "Hoy el gráfico tiene opiniones", "Estoy de turno, el precio también"],
    },
    lastHead,
  );

  if (!view.length) {
    paras.push(
      speak(seed + "empty", {
        real: ["Todavía no hay confluencia fresca. Cuando llegue, armo el plan; no invento sesgo."],
        dry: ["Pantalla en blanco. Puedo opinar igual, pero sería fanfic."],
        fun: ["Cero velas, cero drama. Hasta yo me aburro con dignidad."],
      }),
    );
  } else if (book.universe === "ALL") {
    const board =
      buys.length || sells.length
        ? [
            buys.length ? `Compra: ${buys.map((s) => `${tag(s.symbol)} ${s.confidence.toFixed(0)}%`).join(", ")}.` : "",
            sells.length ? `Venta: ${sells.map((s) => `${tag(s.symbol)} ${s.confidence.toFixed(0)}%`).join(", ")}.` : "",
            waits.length
              ? speak(seed + "w", {
                  real: [`En espera: ${waits.map((s) => tag(s.symbol)).join(", ")}.`],
                  dry: [`${waits.map((s) => tag(s.symbol)).join(", ")} están en modo «después te llamo».`],
                  fun: [`${waits.map((s) => tag(s.symbol)).join(", ")} hoy eligieron el sofá. Los respeto.`],
                })
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : speak(seed + "none", {
            real: [`En ${iv} no hay COMPRAR/VENDER limpio. El plan es no inventar entradas.`],
            dry: [`Seis pares y cero convicción. Hoy ensayan, no estrenan.`],
            fun: [`Nada limpio. Si esto fuera una cita, ya estaría pidiendo la cuenta con sonrisa educada.`],
          });
    paras.push(
      speak(seed + "all", {
        real: [`Tablero de ${iv}. ${board}`],
        dry: [`Recorro las seis en ${iv}. ${board}`],
        fun: [`Pasé lista en ${iv}. ${board}`],
      }),
    );
    if (lead && (lead.bias === "buy" || lead.bias === "sell")) {
      const dir = lead.bias === "buy" ? "compra" : "venta";
      paras.push(
        speak(seed + "lead", {
          real: [
            `Candidata: ${tag(lead.symbol)} (${dir}, ${lead.confidence.toFixed(0)}%). ${cloudTalk(seed, lead.ichiCloud)}. ${rsiTalk(seed, lead.rsi)}. Supertrend ${lead.supertrendDir === 1 ? "alcista" : "bajista"}. Plan: confirmar en ${iv} y no adelantarme.`,
          ],
          dry: [
            `${tag(lead.symbol)} se cree protagonista al ${lead.confidence.toFixed(0)}%. ${cloudTalk(seed, lead.ichiCloud)}. ${rsiTalk(seed, lead.rsi)}. Yo la miro; contrato no hay.`,
          ],
          fun: [
            `${tag(lead.symbol)} al ${lead.confidence.toFixed(0)}% me guiña. Yo le pido que se quede quieta dos velas más. ${cloudTalk(seed, lead.ichiCloud)}.`,
          ],
        }),
      );
    }
  } else {
    const s = view.find((x) => x.symbol === book.universe) ?? view[0];
    if (s) {
      const name = tag(s.symbol);
      const need = neededConfirm(s.interval, paperStyleOf(book));
      const conf = book.confirms[s.symbol];
      const mood =
        s.bias === "buy"
          ? speak(seed + "mb", {
              real: ["sesgo de compra, todavía no es entrada"],
              dry: ["olor a compra, no a desfile"],
              fun: ["el lado largo se acomoda la corbata"],
            })
          : s.bias === "sell"
            ? speak(seed + "ms", {
                real: ["sesgo de venta, sin disparar todavía"],
                dry: ["cara de venta, no de funeral"],
                fun: ["el lado corto levantó la mano como en el colegio"],
              })
            : speak(seed + "mw", {
                real: ["sin sesgo limpio: espera"],
                dry: ["el par se hace el misterioso"],
                fun: ["ni compra ni venta: el clásico «después vemos»"],
              });
      paras.push(
        `${name} en ${ivTalk(s.interval)}: ${mood}. Alineación ${s.confidence.toFixed(0)}% (piso ${minC}%). ${cloudTalk(seed, s.ichiCloud)}. ${rsiTalk(seed, s.rsi)}. Supertrend ${s.supertrendDir === 1 ? "alcista" : "bajista"}.`,
      );
      if (s.bias !== "wait" && conf) {
        if (conf.fire !== s.bias) {
          paras.push(
            speak(seed + "flip", {
              real: ["El sesgo giró. Reinicio confirmaciones. No persigo el giro."],
              dry: ["Cambió de camiseta. Yo vuelvo a contar desde cero."],
              fun: ["Acaba de girar. Gracias por el plot twist; no compro la secuela en preventa."],
            }),
          );
        } else {
          paras.push(
            conf.n >= need
              ? speak(seed + "ripe", {
                  real: [`Confirmaciones ${Math.min(conf.n, need)}/${need}. Está maduro: si riesgo y tope dan, ejecuto.`],
                  dry: [`${Math.min(conf.n, need)} de ${need}: ya no es capricho. Es decisión.`],
                  fun: [`${Math.min(conf.n, need)}/${need}. El semáforo dejó de parpadear. Ahora sí o ahora no, sin poesía.`],
                })
              : speak(seed + "waitc", {
                  real: [`Llevo ${Math.min(conf.n, need)} de ${need} confirmaciones en ${iv}. Falta que se sostenga.`],
                  dry: [`${Math.min(conf.n, need)}/${need}. Puede ser amague. No aprieto por aburrimiento.`],
                  fun: [`${Math.min(conf.n, need)}/${need}. Una vela heroica no me convence; quiero que se quede a dormir.`],
                }),
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
      speak(seed + pos.id, {
        real: [
          `${name} sigue ${pos.side === "long" ? "larga" : "corta"} desde ${usdTalk(pos.entry)}, ahora ${usdTalk(px)} (${uTxt}). Stop ${usdTalk(pos.stop)}${pos.t1Done ? `. T1 (${t1p}%) ya cobrado.` : `; T1 ${usdTalk(pos.t1)}.`} Plan: no agrando ni promedio.`,
        ],
        dry: [
          `Gestión de ${name}: ${uTxt}. El stop es la niñera. ${pos.t1Done ? "Ya saqué T1." : `Si llega a ${usdTalk(pos.t1)}, cobro ${t1p}% y dejo correr.`}`,
        ],
        fun: [
          `${name} está en la oficina (${uTxt}). Yo no le mando «¿llegamos?». Stop y T1 tienen el chat abierto.`,
        ],
      }),
    );
  }

  const readyBuy = buys.find((s) => s.confidence >= minC);

  if (!book.armed) {
    tone = "pause";
    title = speak(seed + "tp", {
      real: ["Pausa operativa", "OFF: solo lectura"],
      dry: ["Me dejaron el mute"],
      fun: ["Pausa con palomitas"],
    });
    paras.push(
      speak(seed + "off", {
        real: ["Estoy en OFF. No abro. Si hay algo abierto, lo cuido hasta el stop o el objetivo."],
        dry: ["Me apagaron. Plan: mirar y no firmar locuras."],
        fun: ["OFF. Soy crítica de cine con el gráfico: opino, no cobro entrada."],
      }),
    );
  } else if (atCap && !book.positions.length) {
    tone = "cap";
    title = speak(seed + "tc", {
      real: ["Tope alcanzado"],
      dry: ["Cupo lleno, show cerrado"],
      fun: ["Sin fichas, con opiniones"],
    });
    paras.push(
      speak(seed + "cap0", {
        real: [`Usé las ${book.maxOps} operaciones. Sigo leyendo; no entro hasta que subas el tope o reinicies.`],
        dry: ["Tope lleno. El mercado puede lucirse; yo ya jugué mi mano."],
        fun: [`${book.maxOps} de ${book.maxOps}. Catálogo de opiniones, inventario de tiros: cero.`],
      }),
    );
  } else if (atCap) {
    tone = "cap";
    title = speak(seed + "tg", { real: ["Solo gestiono"], dry: ["Sin entradas nuevas"], fun: ["Niñera de stop"] });
    paras.push(
      speak(seed + "cap1", {
        real: ["El cupo está lleno. Plan: stop, T1 y T2. Nada de una más."],
        dry: ["Tope completo. Las oportunidades de último minuto se quedan en el pasillo."],
      }),
    );
  } else if (events.some((e) => e.kind === "open")) {
    tone = "open";
    title = speak(seed + "to", { real: ["Operación abierta"], dry: ["Ejecuté, ahora el plan"], fun: ["Ya está, entré"] });
    paras.push(
      speak(seed + "po", {
        real: [`Plan: no muevo el stop en contra. Si corre, T1 ${t1p}% y el resto a T2. Si se da vuelta, el stop cierra.`],
        dry: ["La orden ya voló. Interferir ahora sería vanidad."],
        fun: ["Adentro. El aburrimiento, de ahora en más, es parte del trabajo."],
      }),
    );
  } else if (events.some((e) => e.kind === "scale")) {
    tone = "adjust";
    title = speak(seed + "ta", { real: ["T1 ejecutado"], dry: ["Me pagué el nervio"], fun: ["T1 hecho, ego en jaula"] });
    paras.push(
      speak(seed + "ps", {
        real: ["El trade se autofinanció. Resto con stop en entrada. Si el sesgo gira con confirmación, salgo."],
        fun: ["Ya cobré adelanto. El resto puede lucirse; yo no le mando stickers."],
      }),
    );
  } else if (events.some((e) => e.kind === "close")) {
    tone = "close";
    title = speak(seed + "tx", { real: ["Cerrado, a esperar"], dry: ["Capítulo cerrado"], fun: ["Plata contada, ego a dieta"] });
    paras.push(
      left > 0
        ? speak(seed + "pc", {
            real: [`Quedan ${left} en el tope. No reingreso al mismo movimiento. Piso ${minC}% y confirmación en ${iv}.`],
            dry: [`Cerrado. Me quedan ${left}. Si hay ruido, yo hay paciencia.`],
            fun: [`Listo. ${left} tiro${left === 1 ? "" : "s"} guardados. El bis está prohibido.`],
          })
        : speak(seed + "pc0", { real: ["Tope seco. Nada de una más."] }),
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
    title = speak(seed + "tw", {
      real: [goingBuy ? "Sesgo de compra, espero" : "Sesgo de venta, espero"],
      dry: [goingBuy ? "Huele a compra. No corro" : "Huele a venta. Tampoco corro"],
      fun: ["Hay sesgo. Hay orgullo. Falta el clic"],
    });
    paras.push(
      speak(seed + "pw", {
        real: [
          goingBuy
            ? `Plan: comprar ${tag(hot.symbol)} si se confirma en ${iv} y no se desarma. Alineación ${hot.confidence.toFixed(0)}% (piso ${minC}%). Si RSI se estira o la nube falla, cancelo.`
            : `Plan: corto en ${tag(hot.symbol)} con confirmación, ${minC}%+ y stop primero. No vendo porque «se ve feo».`,
        ],
        dry: [`${planName} es la candidata. El resto es pasillo. Una lectura limpia o nada.`],
        fun: [
          goingBuy
            ? `${tag(hot.symbol)} me guiña al ${hot.confidence.toFixed(0)}%. Confirmación en ${iv} o no hay cita.`
            : `${tag(hot.symbol)} quiere corto. Yo freno, cuento hasta ${minC} y recién hablo.`,
        ],
      }),
    );
  } else {
    tone = "idle";
    title = speak(seed + "ti", {
      real: ["Sin disparo"],
      dry: ["Hoy no firmo locuras"],
      fun: ["El plan es no tener plan de entrada"],
    });
    paras.push(
      speak(seed + "pi", {
        real: [`Nada que merezca orden. ${planName} no llega a ${minC}% limpio. Prefiero no operar.`],
        dry: [`En ${iv} quiero COMPRAR/VENDER limpio o me quedo quieta.`],
        fun: [`El mercado mueve las cejas y le dice tendencia. Yo no pico.`],
      }),
    );
  }

  if (book.armed && !atCap && !events.length) {
    paras.push(
      book.opsUsed === 0
        ? speak(seed + "ops0", {
            real: [`Tope ${book.maxOps} intacto. Riesgo ${risk}% por trade. Solo si la lectura está limpia.`],
            dry: [`Tengo ${book.maxOps} tiros. Los gasto como si fueran míos.`],
            fun: [`${book.maxOps} fichas. No las tiro porque alguien gritó «se va».`],
          })
        : speak(seed + "opsn", {
            real: [`Voy ${book.opsUsed}/${book.maxOps}. Quedan ${left}. No las gasto en un amague de ${planName}.`],
            dry: [`${left} en el bolsillo. Si no está limpio, no está.`],
            fun: [`${left} tiro${left === 1 ? "" : "s"} y un criterio que no se negocia ni con café.`],
          }),
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
    moodOf(seed),
  ].join("/");

  return { at, tone, title, body, fingerprint };
}
