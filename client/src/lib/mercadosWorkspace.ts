import type { ChartDrawTool, ChartDrawing, ChartPoint } from "./mercadosDrawings";

export const MERCADOS_PREF_KEY = "mercados";

export const MERCADOS_STUDY_KEYS = [
  "ema25",
  "ema50",
  "ema200",
  "supertrend",
  "psar",
  "zigzag",
  "ichimoku",
  "bollinger",
  "macd",
  "rsi",
  "jerry",
  "heatmap",
] as const;

export const MERCADOS_INTERVAL_IDS = ["LIVE", "1", "5", "15", "30", "60", "240", "D"] as const;
export const MERCADOS_SYMBOL_IDS = [
  "BINANCE:BTCUSDT",
  "BINANCE:ETHUSDT",
  "BINANCE:LTCUSDT",
  "BINANCE:DOGEUSDT",
  "BINANCE:ZECUSDT",
  "BINANCE:SOLUSDT",
] as const;

const DRAW_TOOLS: ChartDrawTool[] = [
  "cursor",
  "trend",
  "hline",
  "vline",
  "ray",
  "rect",
  "fib",
  "ruler",
  "pencil",
  "eraser",
];

const DRAW_KINDS: ChartDrawing["kind"][] = ["trend", "hline", "vline", "ray", "rect", "fib", "ruler", "pencil"];

export type MercadosWorkspace = {
  v: 1;
  symbol: (typeof MERCADOS_SYMBOL_IDS)[number];
  interval: (typeof MERCADOS_INTERVAL_IDS)[number];
  studyOn: Record<string, boolean>;
  drawTool: ChartDrawTool;
  drawColor: string;
  drawingsByPair: Record<string, ChartDrawing[]>;
};

export function defaultMercadosStudyOn(): Record<string, boolean> {
  return Object.fromEntries(MERCADOS_STUDY_KEYS.map((k) => [k, true]));
}

export function defaultMercadosWorkspace(): MercadosWorkspace {
  return {
    v: 1,
    symbol: "BINANCE:BTCUSDT",
    interval: "60",
    studyOn: defaultMercadosStudyOn(),
    drawTool: "cursor",
    drawColor: "#f5c542",
    drawingsByPair: {},
  };
}

function asPoint(raw: unknown): ChartPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { t?: unknown; p?: unknown };
  const t = Number(o.t);
  const p = Number(o.p);
  if (!Number.isFinite(t) || !Number.isFinite(p)) return null;
  return { t, p };
}

function asDrawing(raw: unknown): ChartDrawing | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "");
  if (!DRAW_KINDS.includes(kind as ChartDrawing["kind"])) return null;
  const a = asPoint(o.a);
  const b = asPoint(o.b);
  if (!a || !b) return null;
  const color = typeof o.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(o.color) ? o.color : "#f5c542";
  const row: ChartDrawing = {
    id: String(o.id ?? Date.now()),
    kind: kind as ChartDrawing["kind"],
    a,
    b,
    color,
  };
  if (Array.isArray(o.pts)) {
    const pts = o.pts.map(asPoint).filter((x): x is ChartPoint => !!x).slice(0, 800);
    if (pts.length) row.pts = pts;
  }
  return row;
}

export function sanitizeMercadosWorkspace(raw: unknown): MercadosWorkspace {
  const base = defaultMercadosWorkspace();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const symbol = String(o.symbol ?? "");
  if ((MERCADOS_SYMBOL_IDS as readonly string[]).includes(symbol)) {
    base.symbol = symbol as MercadosWorkspace["symbol"];
  }
  const interval = String(o.interval ?? "");
  if ((MERCADOS_INTERVAL_IDS as readonly string[]).includes(interval)) {
    base.interval = interval as MercadosWorkspace["interval"];
  }
  const studyOn = defaultMercadosStudyOn();
  if (o.studyOn && typeof o.studyOn === "object") {
    const bag = o.studyOn as Record<string, unknown>;
    for (const k of MERCADOS_STUDY_KEYS) {
      if (typeof bag[k] === "boolean") studyOn[k] = bag[k] as boolean;
    }
  }
  base.studyOn = studyOn;
  const tool = String(o.drawTool ?? "");
  if (DRAW_TOOLS.includes(tool as ChartDrawTool)) base.drawTool = tool as ChartDrawTool;
  const color = String(o.drawColor ?? "");
  if (/^#[0-9a-fA-F]{6}$/.test(color)) base.drawColor = color;
  const drawings: Record<string, ChartDrawing[]> = {};
  if (o.drawingsByPair && typeof o.drawingsByPair === "object") {
    for (const [pair, list] of Object.entries(o.drawingsByPair as Record<string, unknown>)) {
      if (!/^[A-Z0-9]{6,20}$/.test(pair) || !Array.isArray(list)) continue;
      drawings[pair] = list.map(asDrawing).filter((x): x is ChartDrawing => !!x).slice(0, 80);
    }
  }
  base.drawingsByPair = drawings;
  return base;
}

export function mercadosWorkspaceStorageKey(userId: number): string {
  return `sgi_ui_prefs:${userId}:${MERCADOS_PREF_KEY}`;
}

export function readLocalMercadosWorkspace(userId: number): MercadosWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(mercadosWorkspaceStorageKey(userId));
    if (!raw) return null;
    return sanitizeMercadosWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalMercadosWorkspace(userId: number, ws: MercadosWorkspace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(mercadosWorkspaceStorageKey(userId), JSON.stringify(ws));
  } catch {
    /* quota */
  }
}
