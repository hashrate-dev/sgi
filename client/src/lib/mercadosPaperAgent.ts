import type { BtcTradeSignal } from "./api";
import {
  hydrateRoxyFacts,
  hydrateRoxySaid,
  ingestTapeFacts,
  pickFreshFact,
  rememberRoxySaid,
  roxyTooClose,
  type RoxyFact,
} from "./roxyMind";

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
const LESSONS = 80;
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
export type PaperSwingDays = 1 | 2 | 3;
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

export type PaperSkillId =
  | "risk"
  | "patience"
  | "confluence"
  | "trend"
  | "volume"
  | "cloud"
  | "stop"
  | "scale"
  | "noRevenge"
  | "size"
  | "session"
  | "journal"
  | "charisma";

export const ROXY_SKILL_IDS: PaperSkillId[] = [
  "risk",
  "patience",
  "confluence",
  "trend",
  "volume",
  "cloud",
  "stop",
  "scale",
  "noRevenge",
  "size",
  "session",
  "journal",
  "charisma",
];

export type PaperPairMemory = {
  symbol: string;
  wins: number;
  losses: number;
  pnl: number;
  lastLossAt: number;
  lastWinAt: number;
  coolUntil: number;
  stopStreak: number;
  winStreak: number;
};

export type PaperLesson = {
  id: string;
  at: number;
  symbol: string;
  side: "long" | "short";
  reason: string;
  pnl: number;
  text: string;
  skill: PaperSkillId;
};

export type PaperMind = {
  xp: number;
  charisma: number;
  patience: number;
  discipline: number;
  wit: number;
  skills: Record<PaperSkillId, number>;
  pairs: Record<string, PaperPairMemory>;
  lessons: PaperLesson[];
  lastStopAt: number;
  revengeUntil: number;
  said: string[];
  facts: RoxyFact[];
  newsAt: number;
  coffee: number;
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
  mind: PaperMind;
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

function clampSkill(n: number): number {
  if (!Number.isFinite(n)) return 42;
  return Math.max(1, Math.min(100, Math.round(n * 10) / 10));
}

export function emptyRoxyMind(): PaperMind {
  const skills = {} as Record<PaperSkillId, number>;
  for (const id of ROXY_SKILL_IDS) skills[id] = 42;
  skills.risk = 56;
  skills.patience = 52;
  skills.confluence = 54;
  skills.stop = 50;
  skills.noRevenge = 58;
  skills.journal = 44;
  skills.charisma = 50;
  return {
    xp: 0,
    charisma: 50,
    patience: 52,
    discipline: 54,
    wit: 48,
    skills,
    pairs: {},
    lessons: [],
    lastStopAt: 0,
    revengeUntil: 0,
    said: [],
    facts: [],
    newsAt: 0,
    coffee: 0,
  };
}

export function hydrateRoxyMind(raw: unknown): PaperMind {
  const base = emptyRoxyMind();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<PaperMind>;
  const skills = { ...base.skills };
  if (src.skills && typeof src.skills === "object") {
    for (const id of ROXY_SKILL_IDS) {
      const v = (src.skills as Record<string, unknown>)[id];
      if (typeof v === "number") skills[id] = clampSkill(v);
    }
  }
  const pairs: Record<string, PaperPairMemory> = {};
  if (src.pairs && typeof src.pairs === "object") {
    for (const [symbol, row] of Object.entries(src.pairs)) {
      if (!row || typeof row !== "object") continue;
      const p = row as Partial<PaperPairMemory>;
      pairs[symbol] = {
        symbol,
        wins: Math.max(0, Math.floor(Number(p.wins) || 0)),
        losses: Math.max(0, Math.floor(Number(p.losses) || 0)),
        pnl: Number.isFinite(Number(p.pnl)) ? Number(p.pnl) : 0,
        lastLossAt: Number(p.lastLossAt) || 0,
        lastWinAt: Number(p.lastWinAt) || 0,
        coolUntil: Number(p.coolUntil) || 0,
        stopStreak: Math.max(0, Math.floor(Number(p.stopStreak) || 0)),
        winStreak: Math.max(0, Math.floor(Number(p.winStreak) || 0)),
      };
    }
  }
  const lessons = Array.isArray(src.lessons)
    ? src.lessons
        .filter((l): l is PaperLesson => Boolean(l && typeof l === "object" && typeof (l as PaperLesson).text === "string"))
        .slice(0, LESSONS)
    : [];
  return {
    xp: Math.max(0, Math.floor(Number(src.xp) || 0)),
    charisma: clampSkill(src.charisma ?? base.charisma),
    patience: clampSkill(src.patience ?? base.patience),
    discipline: clampSkill(src.discipline ?? base.discipline),
    wit: clampSkill(src.wit ?? base.wit),
    skills,
    pairs,
    lessons,
    lastStopAt: Number(src.lastStopAt) || 0,
    revengeUntil: Number(src.revengeUntil) || 0,
    said: hydrateRoxySaid((src as { said?: unknown }).said),
    facts: hydrateRoxyFacts((src as { facts?: unknown }).facts),
    newsAt: Number((src as { newsAt?: unknown }).newsAt) || 0,
    coffee: Math.max(0, Math.floor(Number((src as { coffee?: unknown }).coffee) || 0)),
  };
}

function pairMem(mind: PaperMind, symbol: string): PaperPairMemory {
  const cur = mind.pairs[symbol];
  if (cur) return cur;
  const fresh: PaperPairMemory = {
    symbol,
    wins: 0,
    losses: 0,
    pnl: 0,
    lastLossAt: 0,
    lastWinAt: 0,
    coolUntil: 0,
    stopStreak: 0,
    winStreak: 0,
  };
  mind.pairs[symbol] = fresh;
  return fresh;
}

function bumpSkill(mind: PaperMind, id: PaperSkillId, d: number): void {
  mind.skills[id] = clampSkill((mind.skills[id] ?? 42) + d);
}

function pushLesson(mind: PaperMind, lesson: Omit<PaperLesson, "id">): void {
  mind.lessons = [{ ...lesson, id: `${lesson.at}-${Math.random().toString(16).slice(2, 8)}` }, ...mind.lessons].slice(0, LESSONS);
}

function applyRoxyLearn(book: PaperBook, events: PaperEvent[], now: number): void {
  const mind = book.mind;
  for (const ev of events) {
    const pair = pairMem(mind, ev.symbol);
    const name = ev.symbol.replace(/USDT$/i, "");
    if (ev.kind === "open") {
      mind.xp += 2;
      bumpSkill(mind, "confluence", 0.25);
      bumpSkill(mind, "session", 0.15);
      bumpSkill(mind, "journal", 0.2);
      pushLesson(mind, {
        at: now,
        symbol: ev.symbol,
        side: ev.side,
        reason: "open",
        pnl: 0,
        skill: "confluence",
        text: `Entrada ${ev.side === "long" ? "larga" : "corta"} en ${name}. Plan escrito: stop primero, sin improvisar el tamaño.`,
      });
    } else if (ev.kind === "scale") {
      mind.xp += 4;
      mind.charisma = clampSkill(mind.charisma + 0.35);
      bumpSkill(mind, "scale", 0.7);
      bumpSkill(mind, "risk", 0.35);
      pair.pnl += ev.pnl ?? 0;
      pushLesson(mind, {
        at: now,
        symbol: ev.symbol,
        side: ev.side,
        reason: "t1",
        pnl: ev.pnl ?? 0,
        skill: "scale",
        text: `T1 en ${name}: cobré parcial y moví el stop a la entrada. El trade ya no me puede devolver al mismo riesgo.`,
      });
    } else {
      const pnl = ev.pnl ?? 0;
      pair.pnl += pnl;
      mind.xp += pnl >= 0 ? 6 : 5;
      bumpSkill(mind, "journal", 0.4);
      if (ev.reason === "stop" || pnl < 0) {
        pair.losses += 1;
        pair.stopStreak += 1;
        pair.winStreak = 0;
        pair.lastLossAt = now;
        mind.lastStopAt = now;
        mind.revengeUntil = now + 12 * 60_000;
        pair.coolUntil = now + (pair.stopStreak >= 2 ? 2 * 60 * 60_000 : 45 * 60_000);
        mind.patience = clampSkill(mind.patience + 0.8);
        mind.discipline = clampSkill(mind.discipline + 1.1);
        mind.wit = clampSkill(mind.wit + 0.25);
        bumpSkill(mind, "stop", 1.1);
        bumpSkill(mind, "noRevenge", 1.2);
        bumpSkill(mind, "patience", 0.9);
        bumpSkill(mind, "risk", 0.5);
        pushLesson(mind, {
          at: now,
          symbol: ev.symbol,
          side: ev.side,
          reason: ev.reason,
          pnl,
          skill: "noRevenge",
          text:
            ev.reason === "stop"
              ? `Stop en ${name} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD). Error registrado: no revancha en el mismo par. Enfriamiento ${pair.stopStreak >= 2 ? "2h" : "45m"}.`
              : `Cierre en rojo en ${name}. Anoto el error y subo el listón; no persigo el mismo movimiento.`,
        });
      } else {
        pair.wins += 1;
        pair.winStreak += 1;
        pair.stopStreak = 0;
        pair.lastWinAt = now;
        mind.charisma = clampSkill(mind.charisma + 0.7);
        mind.wit = clampSkill(mind.wit + 0.4);
        bumpSkill(mind, "trend", ev.reason === "t2" ? 0.9 : 0.45);
        bumpSkill(mind, "charisma", 0.5);
        bumpSkill(mind, "cloud", 0.2);
        pushLesson(mind, {
          at: now,
          symbol: ev.symbol,
          side: ev.side,
          reason: ev.reason,
          pnl,
          skill: ev.reason === "t2" ? "trend" : "scale",
          text: `Cierre a favor en ${name} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD) por ${ev.reason}. Lo que funcionó: dejar correr el plan, no el ego.`,
        });
      }
    }
  }
}

export function roxyAllowsEntry(book: PaperBook, symbol: string, confidence: number, now = Date.now()): boolean {
  const mind = book.mind ?? emptyRoxyMind();
  const pair = mind.pairs[symbol];
  const floor = paperMinConfOf(book);
  if (mind.revengeUntil > now) {
    const last = mind.lessons[0];
    if (last && last.symbol === symbol && (last.reason === "stop" || last.pnl < 0)) return false;
  }
  if (pair && pair.coolUntil > now && confidence < Math.min(88, floor + 14)) return false;
  if (pair && pair.stopStreak >= 3 && confidence < Math.min(88, floor + 10)) return false;
  return true;
}

export function paperEntryFloor(book: PaperBook, symbol: string, now = Date.now()): number {
  let floor = paperMinConfOf(book);
  const mind = book.mind ?? emptyRoxyMind();
  const pair = mind.pairs[symbol];
  const patience = mind.patience ?? 50;
  floor += Math.round((patience - 50) / 20);
  if (pair?.coolUntil && pair.coolUntil > now) floor += 6;
  if ((pair?.stopStreak ?? 0) >= 2) floor += 4;
  if ((pair?.winStreak ?? 0) >= 3) floor -= 1;
  return Math.max(50, Math.min(88, floor));
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
    mind: emptyRoxyMind(),
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
    swingDays: clampPaperSwingDays((parsed as { swingDays?: unknown }).swingDays as number),
    maxOps: clampPaperMaxOps(parsed.maxOps ?? DEFAULT_MAX_OPS),
    maxOpsDay: clampPaperMaxOpsDay(parsed.maxOpsDay ?? DEFAULT_MAX_OPS_DAY),
    opsUsed,
    positions: positionsHydrated,
    trades: trades.slice(0, TRADES),
    confirms: parsed.confirms ?? {},
    fills: parsed.fills ?? [],
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, NOTES) : [],
    mind: hydrateRoxyMind(parsed.mind),
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
    const need = neededConfirm(sig.interval, paperStyleOf(book));
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
    return { pct: 0, stage: "Tope de presupuesto · no hay próxima op", symbol: "", intent: "none" };
  }
  if (paperAtDayCap(book) && !book.positions.length) {
    return { pct: 0, stage: "Tope del día · espera mañana", symbol: "", intent: "none" };
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
  const now = Date.now();
  const minConf = paperEntryFloor(book, sig.symbol, now);
  const style = paperStyleOf(book);
  if (!paperAllowsOpen(sig.interval, style)) return false;
  if (!roxyAllowsEntry(book, sig.symbol, sig.confidence, now)) return false;
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
  const pair = book.mind?.pairs[sig.symbol];
  const now = Date.now();
  const cut = pair && pair.coolUntil > now ? 0.7 : (pair?.stopStreak ?? 0) >= 2 ? 0.75 : (pair?.stopStreak ?? 0) === 1 ? 0.88 : 1;
  const sized = qty * cut;
  if (!(sized > 0) || sized * sig.price < 25) return 0;
  return side === "long" ? sized : -sized;
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

  if (events.length) {
    if (!next.mind) next.mind = emptyRoxyMind();
    applyRoxyLearn(next, events, now);
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
  if (!cur.mind) cur.mind = emptyRoxyMind();
  cur.mind.facts = ingestTapeFacts(cur.mind.facts ?? [], signals, Date.now());
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

function uruguayHour(at: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Montevideo",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function lifeAside(at: number, seed: string, avoid: string[]): string | null {
  const roll = voiceHash(seed + "|life") % 12;
  if (roll > 6) return null;
  if (roll === 0) {
    return speak(seed + "cough", {
      real: ["Cof, cof. Perdón.", "Cof. Se me atravesó el aire acondicionado."],
      dry: ["Cof. Sigo."],
      fun: ["Cof, cof. No es el RSI, soy yo."],
    }, avoid);
  }
  if (roll === 1) {
    return speak(seed + "cafe", {
      real: ["Qué rico este café.", "Mmm, café. Me acomoda la cabeza."],
      dry: ["Café a mano. El resto, filtro."],
      fun: ["Qué rico café. Si el mercado se porta, le invito otro."],
    }, avoid);
  }
  const h = uruguayHour(at);
  const feel =
    h >= 0 && h < 6
      ? speak(seed + "feel", {
          real: ["Estoy un poco soñolienta, pero el stop no duerme.", "Noche larga. Me siento afilada a ratos y floja a otros."],
          dry: ["De madrugada el ego habla más. Yo lo mando a callar."],
          fun: ["Si bostezo, que no se entere el RSI."],
        }, avoid)
      : h < 11
        ? speak(seed + "feel", {
            real: ["Hoy me siento despierta, sin euforia.", "Estoy bien: ni de malas ni de desfile."],
            dry: ["Humor estable. Si se me pasa, culpo al gráfico, no al café."],
            fun: ["Me siento razonable. Qué peligro."],
          }, avoid)
        : h < 16
          ? speak(seed + "feel", {
              real: ["Estoy centrada. Si me pongo impaciente, no opero.", "Me siento bien, con el estómago y la cabeza en su lugar."],
              dry: ["Paciencia de turno. No es heroísmo, es siesta evitada."],
              fun: ["Humor de almuerzo: firme, sin discurso."],
            }, avoid)
          : h < 21
            ? speak(seed + "feel", {
                real: ["Caída la tarde, estoy más seca. Menos clic, más filtro.", "Me siento bien, un poco corta de paciencia con el ruido."],
                dry: ["Tarde uruguay: menos teatro, más plan."],
                fun: ["Estoy de humor fino. El mercado, no."],
              }, avoid)
            : speak(seed + "feel", {
                real: ["Noche. Estoy calma, no heroica.", "Me siento bien para cuidar, no para inventar."],
                dry: ["De noche no firmo locuras. Ya lo aprendí."],
                fun: ["Noche de Uruguay: yo de turno, el FOMO de vacaciones."],
              }, avoid);

  const meal =
    h >= 7 && h < 10
      ? speak(seed + "meal", {
          real: ["Me voy a servir un café… y vuelvo al tape.", "Todavía me entra el primer café. Sin apuro."],
          dry: ["Café en mano. El mercado que espere su turno."],
          fun: ["Voy por café. Si el precio se pinta de héroe, que me deje un recado."],
        }, avoid)
      : h >= 10 && h < 12
        ? speak(seed + "meal", {
            real: ["Tomo agua. El RSI no se hidrata solo.", "Segundo café, más corto. Cabeza limpia."],
            dry: ["Agua. El café ya hizo su parte."],
            fun: ["Un sorbo de agua y a no perseguir nada que se estire."],
          }, avoid)
        : h >= 12 && h < 13
          ? speak(seed + "meal", {
              real: ["Voy a almorzar. Si no está limpio, espera.", "Hora de almuerzo en Uruguay. No opero con hambre."],
              dry: ["Almuerzo primero. El tape no se enfría tanto."],
              fun: ["Me voy a almorzar. El FOMO que haga cola."],
            }, avoid)
          : h >= 13 && h < 16
            ? speak(seed + "meal", {
                real: ["Ya almorcé. Estómago en paz, criterio igual.", "Almuerzo hecho. Ahora sí miro con menos hambre de clic."],
                dry: ["Comí. Traducción: menos drama."],
                fun: ["Almorcé. El mercado no me va a convencer con postre."],
              }, avoid)
            : h >= 16 && h < 19
              ? speak(seed + "meal", {
                  real: ["Un café de tarde, corto.", "Tomo agua y dejo que la vela termine."],
                  dry: ["Mate interno, cara de poker."],
                  fun: ["Café de las cinco. Si entra, entra. Si no, que se quede en el pasillo."],
                }, avoid)
              : h >= 19 && h < 21
                ? speak(seed + "meal", {
                    real: ["Voy a cenar en un rato. Hasta entonces, filtro.", "Hora de cocina en Uruguay. No firmo con hambre."],
                    dry: ["Cena a la vista. Operar ahora sería antojo."],
                    fun: ["Me voy a cenar. El gráfico que no me espere despierta."],
                  }, avoid)
                : h >= 21 && h < 24
                  ? speak(seed + "meal", {
                      real: ["Ya cené. Estoy para cuidar, no para abrir de más.", "Cena hecha. Noche de gestión, no de héroe."],
                      dry: ["Cenaré… o ya cené, según el reloj. El stop, igual."],
                      fun: ["Cenaré y el mercado no se viene a la mesa. Jaja."],
                    }, avoid)
                  : speak(seed + "meal", {
                      real: ["Madrugada. Agua, no más café, que si no invento sesgo.", "De madrugada no ceno: vigilo."],
                      dry: ["Turno de noche. Café solo si el plan ya estaba escrito."],
                      fun: ["Si me tomo otro café a esta hora, el MACD me va a parecer gracioso. Jaja."],
                    }, avoid);

  if (roll <= 1) return feel;
  if (roll === 2) return meal;
  return `${feel} ${meal}`;
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

type RoxyMood = "real" | "dry" | "fun";

function moodOf(seed: string): RoxyMood {
  const r = voiceHash(seed + "|mood") % 10;
  if (r === 0) return "fun";
  if (r <= 2) return "dry";
  return "real";
}

function normTalk(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tooClose(a: string, b: string): boolean {
  return roxyTooClose(a, b);
}

function speak(
  seed: string,
  pack: { real: string[]; dry?: string[]; fun?: string[] },
  avoid?: string | string[],
): string {
  const corpus = (Array.isArray(avoid) ? avoid : avoid ? [avoid] : []).map(normTalk).filter(Boolean);
  const trySeed = (s: string) => {
    const mood = moodOf(s);
    const bank = mood === "fun" && pack.fun?.length ? pack.fun : mood === "dry" && pack.dry?.length ? pack.dry : pack.real;
    return bank[voiceHash(s + mood) % bank.length]!;
  };
  let s = seed;
  for (let i = 0; i < 28; i++) {
    const t = trySeed(s);
    if (!corpus.some((c) => tooClose(t, c))) return t;
    s = `${seed}~${i}`;
  }
  const all = [...pack.real, ...(pack.dry ?? []), ...(pack.fun ?? [])];
  const leftover = all.filter((t) => !corpus.some((c) => tooClose(t, c)));
  if (leftover.length) return leftover[voiceHash(seed + "fresh") % leftover.length]!;
  return "";
}

function cloudTalk(seed: string, c: BtcTradeSignal["ichiCloud"], avoid: string[]): string {
  if (c === "above") {
    return speak(seed + "c", {
      real: ["el precio está arriba de la nube, y eso me gusta, no me alcanza sola", "la nube le está haciendo de piso, por ahora"],
      dry: ["arriba de la nube, sí. Tranquila, no es un milagro", "la nube sostiene. Yo todavía no festejo"],
      fun: ["la nube nos da un colchón. Cómoda, nada más"],
    }, avoid);
  }
  if (c === "below") {
    return speak(seed + "c", {
      real: ["estamos debajo de la nube, el sesgo viene pesado", "con la nube arriba, me cuesta comprar"],
      dry: ["debajo de la nube el techo queda feo", "si alguien grita rebote mágico, yo paso"],
      fun: ["la nube nos dejó en visto. Clásico"],
    }, avoid);
  }
  if (c === "inside") {
    return speak(seed + "c", {
      real: ["estamos dentro de la nube, zona de duda", "nube adentro, espero que elija un lado"],
      dry: ["metidos en la niebla. Acá todo el mundo se vuelve experto", "la nube nos tragó, no firmo nada en la bruma"],
      fun: ["nube adentro, como cuando no se entiende ni el clima"],
    }, avoid);
  }
  return "";
}

function rsiTalk(seed: string, rsi: number, avoid: string[]): string {
  const n = rsi.toFixed(0);
  if (rsi >= 76) {
    return speak(seed + "r", {
      real: [`El erre ese i está en ${n}, estiradísimo. Perseguir acá es pagar el nervio`],
      dry: [`Erre ese i en ${n}. Comprar ahora es invitar al que vende`],
      fun: [`Erre ese i ${n}. Si esto fuera fiesta, ya estarían sacando las sillas`],
    }, avoid);
  }
  if (rsi >= 68) {
    return speak(seed + "r", {
      real: [`El erre ese i está en ${n}. Hay fuerza, y también gente llegando tarde`],
      dry: [`Erre ese i ${n}, lindo momentum, saturación a la vuelta`],
      fun: [`Erre ese i ${n}. El globo está lindo, yo no le pongo más aire`],
    }, avoid);
  }
  if (rsi <= 24) {
    return speak(seed + "r", {
      real: [`El erre ese i está en ${n}, sobreventa extrema. No vendo el piso`],
      dry: [`Erre ese i ${n}. Vender más es patear a un caído`],
      fun: [`Erre ese i ${n}. El piso hace teatro, yo no aplaudo todavía`],
    }, avoid);
  }
  if (rsi <= 32) {
    return speak(seed + "r", {
      real: [`El erre ese i está en ${n}, hay mal humor vendedor, lo respeto`],
      dry: [`Erre ese i ${n}, el mercado está de malas`],
      fun: [`Erre ese i ${n}. Bajón con estilo, yo no me sumo al coro`],
    }, avoid);
  }
  return speak(seed + "r", {
    real: [`El erre ese i está en ${n}, zona tranquila, sirve para pensar`],
    dry: [`Erre ese i ${n}, equilibrado y un poco aburrido. Mejor así`],
    fun: [`Erre ese i ${n}. Ni euforia ni funeral`],
  }, avoid);
}

function oneDetail(seed: string, s: BtcTradeSignal, avoid: string[], angle: number): string {
  const slot = angle % 4;
  if (slot === 0) return rsiTalk(seed, s.rsi, avoid);
  if (slot === 1) return cloudTalk(seed, s.ichiCloud, avoid);
  if (slot === 2) {
    return speak(seed + "st", {
      real: [s.supertrendDir === 1 ? "el supertrend sigue para arriba" : "el supertrend sigue para abajo"],
      dry: [s.supertrendDir === 1 ? "el supertrend no se bajó" : "el supertrend sigue con los vendedores"],
      fun: [s.supertrendDir === 1 ? "el supertrend está de buen humor" : "el supertrend se puso serio"],
    }, avoid);
  }
  const hist = s.macdHist;
  return speak(seed + "md", {
    real: [hist >= 0 ? "el mac d acompaña para arriba" : "el mac d no firma el alza"],
    dry: [hist >= 0 ? "el mac d en verde, sin fanfarria" : "el mac d flojo, yo tampoco me emociono"],
    fun: [hist >= 0 ? "el mac d asiente, como quien dice bueno, sigo" : "el mac d cruzó los brazos"],
  }, avoid);
}

function reasonTalk(reason: string): string {
  if (reason === "stop") return "el stop";
  if (reason === "t2") return "el objetivo 2";
  if (reason === "t1") return "el objetivo 1";
  if (reason === "flip") return "un giro de sesgo";
  if (reason === "time") return "tiempo de scalp";
  if (reason === "day") return "cierre del día";
  if (reason === "swing") return "cierre de swing";
  return reason;
}

export function pushPaperNote(book: PaperBook, note: Omit<PaperNote, "id">): PaperBook {
  const last = book.notes[0];
  if (last && roxyTooClose(last.body, note.body)) {
    return book;
  }
  if (book.notes.some((n) => roxyTooClose(n.body, note.body))) {
    return book;
  }
  const same = last && last.fingerprint === note.fingerprint;
  const fresh = last && note.at - last.at < 75_000;
  if (same && fresh) {
    return book;
  }
  const full: PaperNote = {
    ...note,
    id: `${note.at}-${Math.random().toString(16).slice(2, 8)}`,
  };
  const mind = book.mind ?? emptyRoxyMind();
  mind.said = rememberRoxySaid(mind.said ?? [], [note.title, ...note.body.split(/\n+/)]);
  if (/caf[eé]/i.test(`${note.title} ${note.body}`)) mind.coffee = (mind.coffee ?? 0) + 1;
  return { ...book, mind, notes: [full, ...(book.notes ?? [])].slice(0, NOTES) };
}

function newsClip(
  book: PaperBook,
  tag: (symbol: string) => string,
  wantSyms: string[],
  recent: string[],
  seed: string,
): string {
  const fact = pickFreshFact(book.mind?.facts ?? [], "news", wantSyms, recent, voiceHash(seed + "news"));
  if (!fact) return "";
  let t = fact.text.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (t.length > 150) t = `${t.slice(0, 147)}…`;
  const who = fact.symbol ? tag(fact.symbol) : "cripto";
  return speak(
    seed + "nws",
    {
      real: [
        `Noticia del momento en ${who}: ${t}.`,
        `Acabo de leer en el desk: ${t}.`,
        `En el wire ahora, ${who}: ${t}.`,
      ],
      dry: [`Titular fresco de ${who}: ${t}.`],
      fun: [`Mientras, en noticias: ${t}.`],
    },
    recent,
  );
}

function biasWord(bias: string): string {
  if (bias === "buy") return "compra";
  if (bias === "sell") return "venta";
  return "sin lado claro";
}

export function narratePaper(
  book: PaperBook,
  signals: BtcTradeSignal[],
  events: PaperEvent[],
  tag: (symbol: string) => string,
): Omit<PaperNote, "id"> {
  const at = Date.now();
  const beat = Math.floor(at / 18_000);
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
  const lead = [...view].sort((a, b) => b.confidence - a.confidence)[0];
  const hot = buys[0] ?? sells[0] ?? lead;
  const rawIv = view[0]?.interval || book.runInterval || "";
  const iv = ivTalk(rawIv);
  const band = scalpBand(rawIv);
  const tradeStyle = paperStyleOf(book);
  const recent = [
    ...(book.mind?.said ?? []),
    ...(book.notes ?? []).slice(0, 12).flatMap((n) => [n.title, ...(n.body.split(/\n+/))]),
  ];
  const angle = beat % 5;
  const seed = `${beat}|a${angle}|s${book.mind?.said?.length ?? 0}|n${book.mind?.facts?.length ?? 0}|${book.universe}|${rawIv}|${lead?.symbol ?? ""}|${lead?.bias ?? "x"}|${Math.round((lead?.confidence ?? 0) / 4)}|${book.armed ? 1 : 0}|${book.positions.length}`;
  const paras: string[] = [];
  const wantSyms = book.universe === "ALL" ? view.map((s) => s.symbol) : [book.universe];
  const nws = () => newsClip(book, tag, wantSyms, recent, seed);

  for (const ev of events) {
    const name = tag(ev.symbol);
    if (ev.kind === "open") {
      paras.push(
        speak(
          seed + ev.symbol + "o",
          {
            real: [
              `Abrí ${name} ${ev.side === "long" ? "larga" : "corta"} a ${usdTalk(ev.price)} en ${iv}. Riesgo ${risk}%. Ahora dejo correr stop y objetivos.`,
              `Entré en ${name} a ${usdTalk(ev.price)}. ${tradeStyle === "swing" ? "Swing: salgo por stop, objetivo o giro." : "Scalp del día: si no paga, salgo."}`,
            ],
            dry: [`Operación nueva: ${name} a ${usdTalk(ev.price)}. Ya está en el libro.`],
            fun: [`Listo, ${name} es mía a ${usdTalk(ev.price)}. Ahora a no manosearla.`],
          },
          recent,
        ),
      );
    } else if (ev.kind === "scale") {
      paras.push(
        speak(
          seed + ev.symbol + "sc",
          {
            real: [`Saqué el ${t1p}% de ${name} en el primer objetivo y subí el stop a la entrada.`],
            dry: [`Parcial en ${name}. El resto ya no me puede devolver el mismo riesgo.`],
            fun: [`${name} me pagó un adelanto. El resto, que se luzca.`],
          },
          recent,
        ),
      );
    } else {
      const pnl = ev.pnl ?? 0;
      const signed = `${pnl >= 0 ? "+" : ""}${usdTalk(pnl)}`;
      paras.push(
        speak(
          seed + ev.symbol + "cl",
          {
            real: [`Cerré ${name} por ${reasonTalk(ev.reason)}: ${signed}. No persigo el mismo movimiento.`],
            dry: [`Salí de ${name} (${signed}). Capítulo cerrado.`],
            fun: [`Listo ${name}, ${signed}. Sin bis.`],
          },
          recent,
        ),
      );
    }
  }

  let tone: PaperNoteTone = "idle";
  let title = speak(seed + "t0", { real: ["Resumen", "Lo que estoy haciendo", "Ahora"], dry: ["Tape"], fun: ["De turno"] }, recent);

  if (!book.armed) {
    tone = "pause";
    title = "En pausa";
    paras.push(
      speak(seed + "off", {
        real: ["Estoy en pausa: miro el tape y las noticias, no abro nada nuevo."],
        dry: ["OFF. Solo lectura."],
        fun: ["Pausa. Opino, no disparo."],
      }, recent),
    );
  } else if (atCap && !book.positions.length) {
    tone = "cap";
    title = "Tope del día";
    paras.push(
      speak(seed + "cap0", {
        real: [`Ya usé las ${book.maxOps} operaciones. Sigo el mercado, no entro otra.`],
        dry: ["Cupo lleno. Solo comento."],
      }, recent),
    );
  } else if (atCap) {
    tone = "cap";
    title = "Solo gestiono";
    paras.push(
      speak(seed + "cap1", {
        real: ["El cupo está lleno. Cuido lo abierto: stop y objetivos, nada de una más."],
      }, recent),
    );
  } else if (events.some((e) => e.kind === "open")) {
    tone = "open";
    title = "Entré";
  } else if (events.some((e) => e.kind === "scale")) {
    tone = "adjust";
    title = "Parcial cobrado";
  } else if (events.some((e) => e.kind === "close")) {
    tone = "close";
    title = "Cerré";
    if (left > 0) {
      paras.push(
        speak(seed + "pc", {
          real: [`Me quedan ${left} en el día. La próxima idea tiene que ser otra, no la misma.`],
        }, recent),
      );
    }
  } else if (book.positions.length) {
    tone = "hold";
    const pos = book.positions[0]!;
    const s = view.find((x) => x.symbol === pos.symbol);
    const px = s?.price ?? pos.entry;
    const u = pos.qty * (px - pos.entry);
    const name = tag(pos.symbol);
    const uTxt = `${u >= 0 ? "+" : ""}${usdTalk(u)}`;
    title = speak(seed + "th", { real: [`Sostengo ${name}`, "Operación abierta"], dry: ["Adentro"], fun: ["Dejo correr"] }, recent);
    const next = pos.t1Done
      ? `Ya cobré parcial. Stop en la entrada, apunto al segundo objetivo en ${usdTalk(pos.t2)}.`
      : `Si llega a ${usdTalk(pos.t1)} saco parcial; si toca ${usdTalk(pos.stop)}, salgo.`;
    paras.push(
      speak(seed + "ph", {
        real: [
          `${name} sigue ${pos.side === "long" ? "larga" : "corta"} desde ${usdTalk(pos.entry)}, ahora ${usdTalk(px)} (${uTxt}). ${next}`,
          `Tengo ${name} abierta (${uTxt}). ${next}`,
        ],
        dry: [`Gestión: ${name} ${uTxt}. ${next}`],
        fun: [`${name} está trabajando (${uTxt}). Yo no la toco. ${next}`],
      }, recent),
    );
    if (s && angle % 2 === 0) {
      paras.push(
        speak(seed + "phd", {
          real: [`Dato: ${oneDetail(seed, s, recent, angle)}.`],
        }, recent),
      );
    }
  } else if (tradeStyle === "swing" && !paperAllowsOpen(rawIv, "swing")) {
    tone = "idle";
    title = "Otro gráfico";
    paras.push(
      speak(seed + "sw", {
        real: [`Estoy en swing. En ${iv} solo miro contexto; para abrir quiero 15 minutos, 1 hora, 4 horas o diario.`],
      }, recent),
    );
  } else if (tradeStyle !== "swing" && band === "context") {
    tone = "idle";
    title = "Mapa, no clic";
    const name = hot ? tag(hot.symbol) : "el tape";
    paras.push(
      speak(seed + "ctx", {
        real: [
          `Estoy en ${iv}, esto me sirve de mapa. ${hot ? `${name} va de ${biasWord(hot.bias)} al ${hot.confidence.toFixed(0)}%.` : ""} Para operar intradía bajo a velas más cortas.`,
        ],
      }, recent),
    );
  } else if (!view.length) {
    paras.push(
      speak(seed + "empty", {
        real: ["Todavía no me llega una lectura. Cuando haya confluencia, armo el resumen."],
      }, recent),
    );
  } else if (hot && (hot.bias === "buy" || hot.bias === "sell") && hot.confidence >= minC) {
    tone = "watch";
    const name = tag(hot.symbol);
    const goingBuy = hot.bias === "buy";
    title = goingBuy ? `Miro compra en ${name}` : `Miro venta en ${name}`;
    const conf = book.confirms[hot.symbol];
    const need = neededConfirm(hot.interval, tradeStyle);
    const count = conf && conf.fire === hot.bias ? Math.min(conf.n, need) : 0;
    paras.push(
      speak(seed + "watch", {
        real: [
          `Resumen: ${name} tira a ${biasWord(hot.bias)} al ${hot.confidence.toFixed(0)}% en ${iv}. ${oneDetail(seed, hot, recent, angle)}. ${count >= need ? "Si el riesgo da, el próximo paso es entrar." : `Voy ${count} de ${need} velas de confirmación; si se desarma, cancelo.`}`,
          `Lo que estoy haciendo: esperar ${name}. Hay olor a ${biasWord(hot.bias)}, alineación ${hot.confidence.toFixed(0)}%. ${oneDetail(seed + "d", hot, recent, angle + 1)}. No corro el primer guiño.`,
        ],
        dry: [`${name}: ${biasWord(hot.bias)}, ${hot.confidence.toFixed(0)}%. ${count}/${need} confirmaciones.`],
        fun: [`${name} me guiña (${hot.confidence.toFixed(0)}%). Yo pido que se quede dos velas. ${oneDetail(seed + "f", hot, recent, angle)}.`],
      }, recent),
    );
  } else if (hot) {
    tone = "idle";
    const name = tag(hot.symbol);
    title = speak(seed + "ti", { real: ["Sin disparo", "Espero algo limpio"], dry: ["Nada maduro"], fun: ["Manos quietas"] }, recent);
    const board =
      buys.length || sells.length
        ? `Lo más vivo es ${name} (${biasWord(hot.bias)}, ${hot.confidence.toFixed(0)}%), pero no me alcanza el piso de ${minC}%.`
        : `En ${iv} nadie me da un comprar o vender limpio.`;
    paras.push(
      speak(seed + "idle", {
        real: [
          `${board} ${lead ? oneDetail(seed, lead, recent, angle) + "." : ""} Yo espero. Me quedan ${left} operaciones en el día.`,
          `Ahora mismo no hay oficio. ${board}`,
        ],
        dry: [`Sin orden. ${board}`],
        fun: [`Nada que merezca clic. ${board}`],
      }, recent),
    );
  }

  const news = nws();
  if (news) paras.push(news);

  if (voiceHash(seed + "|life") % 9 === 0 && !events.length) {
    const aside = lifeAside(at, seed, recent);
    if (aside) paras.push(aside);
  }

  const last = book.notes[0];
  let body = paras.filter(Boolean).slice(0, 4).join(" ");
  if (last && !events.length && body && roxyTooClose(body, last.body)) {
    return { at: last.at, tone: last.tone, title: last.title, body: last.body, fingerprint: last.fingerprint };
  }
  const fingerprint = [
    tone,
    String(beat),
    `a${angle}`,
    book.armed ? "on" : "off",
    book.universe,
    String(book.maxOps),
    String(book.opsUsed),
    book.positions.map((p) => `${p.id}:${p.t1Done ? "t1" : "open"}`).join(","),
    view.map((s) => `${s.symbol}:${s.bias}:${Math.round(s.confidence / 5) * 5}`).join("|"),
    events.map((e) => e.kind + e.symbol).join(","),
    moodOf(seed),
    String(book.mind?.newsAt ?? 0),
    String(book.mind?.said?.length ?? 0),
  ].join("/");

  return { at, tone, title, body, fingerprint };
}
