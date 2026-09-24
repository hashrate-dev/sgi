import { useEffect, useMemo, useRef } from "react";
import {
  emaSeries,
  jerryMarks,
  macdSeries,
  parabolicSar,
  rsiWilder,
  supertrend,
  zigzagPivots,
  ZZ_PCT,
  addCandleHeat,
  ichimokuCloud,
  bollingerBands,
  type MarketCandle,
} from "../lib/mercadosChartMath";
import {
  FIB_LEVELS,
  distToPoly,
  distToSeg,
  fracIndex,
  hexToRgba,
  timeAtIndex,
  type ChartDrawTool,
  type ChartDrawing,
  type ChartPoint,
} from "../lib/mercadosDrawings";

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com", "https://api.binance.us"];

const TF: Record<string, string> = {
  LIVE: "1s",
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

const TF_MS: Record<string, number> = {
  "1s": 1_000,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

function expectedBarMs(interval: string): number {
  return TF_MS[TF[interval] ?? ""] ?? 0;
}

function typicalBarMs(rows: MarketCandle[]): number {
  if (rows.length < 2) return 0;
  const dts: number[] = [];
  const from = Math.max(1, rows.length - 48);
  for (let i = from; i < rows.length; i++) {
    const d = rows[i]!.t - rows[i - 1]!.t;
    if (d > 0) dts.push(d);
  }
  if (!dts.length) return 0;
  dts.sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)]!;
}

function snapshotMatchesTf(rows: MarketCandle[], interval: string): boolean {
  const expect = expectedBarMs(interval);
  if (expect <= 0 || rows.length < 2) return rows.length >= 2;
  const dt = typicalBarMs(rows);
  if (dt <= 0) return false;
  const ratio = dt > expect ? dt / expect : expect / dt;
  return ratio < 1.8;
}

const WS_KLINE = (symbol: string, tf: string) =>
  `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${tf}`;

export type { ChartDrawTool };

type Studies = Record<string, boolean>;

type Props = {
  binance: string;
  interval: string;
  studyOn: Studies;
  drawTool?: ChartDrawTool;
  drawColor?: string;
  drawPulse?: { n: number; op: "undo" | "clear" };
};

function fmtOsc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(2);
  if (a >= 10) return n.toFixed(2);
  if (a >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function lastFiniteAt(arr: number[], i: number): number {
  for (let k = i; k >= 0; k--) {
    const v = arr[k];
    if (Number.isFinite(v)) return v!;
  }
  return NaN;
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function fmtTime(t: number, interval: string): string {
  const d = new Date(t);
  if (interval === "D") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (interval === "LIVE") {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function barStep(rows: MarketCandle[]): number {
  if (rows.length < 2) return 0;
  return Math.max(1, rows[rows.length - 1]!.t - rows[rows.length - 2]!.t);
}

function mergeCandleSnapshot(prev: MarketCandle[], snap: MarketCandle[]): MarketCandle[] {
  if (snap.length < 2) return prev;
  if (prev.length < 2) return snap;
  const dPrev = typicalBarMs(prev);
  const dSnap = typicalBarMs(snap);
  if (dPrev > 0 && dSnap > 0) {
    const ratio = dSnap > dPrev ? dSnap / dPrev : dPrev / dSnap;
    if (ratio >= 2.5) return prev;
  }
  if (prev.length >= 220 && snap.length < 220 && dSnap > 0 && dPrev > 0 && dSnap <= dPrev * 1.8) return prev;
  if (prev.length >= 80 && snap.length < Math.floor(prev.length * 0.55) && dSnap > 0 && dPrev > 0 && Math.abs(dSnap - dPrev) < dPrev * 0.5)
    return prev;
  const lastPrev = prev[prev.length - 1]!;
  const lastSnap = snap[snap.length - 1]!;
  let out = snap;
  if (lastPrev.t > lastSnap.t) {
    out = snap.concat(prev.filter((c) => c.t > lastSnap.t));
  } else if (lastPrev.t === lastSnap.t) {
    out = snap.slice();
    out[out.length - 1] = {
      t: lastSnap.t,
      o: lastSnap.o,
      h: Math.max(lastSnap.h, lastPrev.h),
      l: Math.min(lastSnap.l, lastPrev.l),
      c: lastPrev.c,
      v: Math.max(lastSnap.v, lastPrev.v),
    };
  }
  return out;
}

async function fetchCandles(binance: string, interval: string): Promise<MarketCandle[]> {
  const live = interval === "LIVE";
  const tf = TF[interval] ?? "1h";
  const limit = live ? 1000 : 500;
  const minN = live ? 220 : 40;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/klines?symbol=${binance}&interval=${tf}&limit=${limit}`);
      if (!res.ok) throw new Error("http");
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) throw new Error("klines");
      const next: MarketCandle[] = [];
      for (const row of raw) {
        if (!Array.isArray(row) || row.length < 6) continue;
        const t = Number(row[0]);
        const o = Number(row[1]);
        const h = Number(row[2]);
        const l = Number(row[3]);
        const c = Number(row[4]);
        const v = Number(row[5]);
        if (![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) continue;
        next.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
      }
      if (next.length >= minN && snapshotMatchesTf(next, interval)) return next;
    } catch {
      /* next host */
    }
  }
  return [];
}

export function MercadosNativeChart({
  binance,
  interval,
  studyOn,
  drawTool = "cursor",
  drawColor = "#f5c542",
  drawPulse,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<MarketCandle[]>([]);
  const viewRef = useRef({ end: 0, count: 120, follow: true });
  const scaleRef = useRef({ auto: true, min: 0, max: 1 });
  const dragRef = useRef<{
    mode: "pan" | "zoomX" | "zoomY";
    x: number;
    y: number;
    end: number;
    count: number;
    min: number;
    max: number;
  } | null>(null);
  const hoverRef = useRef<number | null>(null);
  const geomRef = useRef({
    padL: 56,
    padR: 78,
    timeH: 32,
    priceTop: 10,
    priceBot: 0,
    h: 0,
    w: 0,
    start: 0,
    barW: 1,
    minP: 0,
    span: 1,
  });
  const axisYRef = useRef<HTMLDivElement>(null);
  const axisXRef = useRef<HTMLDivElement>(null);
  const onRef = useRef(studyOn);
  onRef.current = studyOn;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const paintGen = useRef(0);
  const drawToolRef = useRef<ChartDrawTool>(drawTool);
  drawToolRef.current = drawTool;
  const drawColorRef = useRef(drawColor);
  drawColorRef.current = drawColor;
  const pairRef = useRef(binance);
  pairRef.current = binance;
  const drawingsByPair = useRef<Record<string, ChartDrawing[]>>({});
  const draftRef = useRef<ChartDrawing | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const deleteHitsRef = useRef<Array<{ x: number; y: number; r: number; id: string }>>([]);
  const downRef = useRef<{ x: number; y: number; tool: ChartDrawTool } | null>(null);

  const drawingsOf = () => {
    const k = pairRef.current;
    if (!drawingsByPair.current[k]) drawingsByPair.current[k] = [];
    return drawingsByPair.current[k]!;
  };

  const toXy = (pt: ChartPoint) => {
    const g = geomRef.current;
    const i = fracIndex(candlesRef.current, pt.t);
    return {
      x: g.padL + (i - g.start + 0.5) * g.barW,
      y: g.priceTop + (1 - (pt.p - g.minP) / Math.max(1e-12, g.span)) * (g.priceBot - g.priceTop),
    };
  };

  const fromEvent = (e: PointerEvent): ChartPoint | null => {
    const wrap = wrapRef.current;
    const g = geomRef.current;
    const candles = candlesRef.current;
    if (!wrap || candles.length < 2) return null;
    const rect = wrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < g.priceTop - 4 || y > g.priceBot + 4) return null;
    const i = g.start + (x - g.padL) / Math.max(0.001, g.barW) - 0.5;
    const p = g.minP + (1 - (y - g.priceTop) / Math.max(1, g.priceBot - g.priceTop)) * g.span;
    return { t: timeAtIndex(candles, i), p };
  };

  const studiesKey = useMemo(() => JSON.stringify(studyOn), [studyOn]);

  const requestPaint = () => {
    const id = ++paintGen.current;
    requestAnimationFrame(() => {
      if (id !== paintGen.current) return;
      paint();
    });
  };

  useEffect(() => {
    let dead = false;
    let seq = 0;
    const live = interval === "LIVE";
    const binanceTf = TF[interval] ?? "1h";
    candlesRef.current = [];
    hoverRef.current = null;
    viewRef.current.count = live ? 180 : 120;
    viewRef.current.follow = true;
    scaleRef.current.auto = true;
    requestPaint();

    const applyRows = (rows: MarketCandle[]) => {
      if (dead || rows.length < 2) return;
      if (!snapshotMatchesTf(rows, interval)) return;
      const prev = candlesRef.current;
      const next = mergeCandleSnapshot(prev, rows);
      if (next.length < 2) return;
      candlesRef.current = next;
      const v = viewRef.current;
      if (v.follow || prev.length === 0) {
        v.end = Math.max(0, next.length - 1);
        v.follow = true;
      } else {
        v.end = Math.min(v.end, Math.max(0, next.length - 1));
      }
      requestPaint();
    };

    const upsert = (c: MarketCandle) => {
      if (dead) return;
      const rows = candlesRef.current.slice();
      const last = rows[rows.length - 1];
      const expect = expectedBarMs(interval);
      if (last && last.t === c.t) rows[rows.length - 1] = c;
      else if (!last || c.t > last.t) {
        if (last && expect > 0 && c.t - last.t < expect * 0.45) return;
        rows.push(c);
        if (rows.length > 1200) rows.splice(0, rows.length - 1000);
      } else return;
      candlesRef.current = rows;
      if (viewRef.current.follow) viewRef.current.end = rows.length - 1;
      requestPaint();
    };

    const pull = async () => {
      const my = ++seq;
      const rows = await fetchCandles(binance, interval);
      if (dead || my !== seq) return;
      applyRows(rows);
    };

    let ws: WebSocket | null = null;
    void pull().then(() => {
      if (dead) return;
      try {
        ws = new WebSocket(WS_KLINE(binance, binanceTf));
        if (dead) {
          ws.close();
          ws = null;
          return;
        }
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              k?: { t?: number; o?: string; h?: string; l?: string; c?: string; v?: string };
            };
            const k = msg.k;
            if (!k) return;
            const o = Number(k.o);
            const h = Number(k.h);
            const l = Number(k.l);
            const c = Number(k.c);
            const v = Number(k.v);
            const ts = Number(k.t);
            if (![o, h, l, c, ts].every((n) => Number.isFinite(n))) return;
            upsert({ t: ts, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
          } catch {
            /* ignore frame */
          }
        };
      } catch {
        /* REST polling already running */
      }
    });
    const pollMs = live ? 12000 : 15000;
    const t = window.setInterval(() => void pull(), pollMs);

    return () => {
      dead = true;
      window.clearInterval(t);
      if (ws) {
        ws.onmessage = null;
        ws.close();
      }
    };
  }, [binance, interval]);

  useEffect(() => {
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studiesKey]);

  useEffect(() => {
    if (!drawPulse || drawPulse.n <= 0) return;
    if (drawPulse.op === "clear") drawingsByPair.current[pairRef.current] = [];
    else {
      const list = drawingsOf();
      const sel = selectedIdRef.current;
      const idx = sel ? list.findIndex((d) => d.id === sel) : -1;
      if (idx >= 0) list.splice(idx, 1);
      else list.pop();
    }
    selectedIdRef.current = null;
    draftRef.current = null;
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawPulse?.n]);

  useEffect(() => {
    drawColorRef.current = drawColor;
    if (draftRef.current) draftRef.current.color = drawColor;
    const sel = selectedIdRef.current;
    if (sel) {
      const d = drawingsOf().find((x) => x.id === sel);
      if (d) d.color = drawColor;
    }
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawColor]);

  function layout() {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 40 || h < 40) return null;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tool = drawToolRef.current;
    canvas.style.cursor = tool === "cursor" ? "crosshair" : tool === "eraser" ? "cell" : "crosshair";
    return { ctx, w, h };
  }

  function paint() {
    const box = layout();
    if (!box) return;
    const { ctx, w, h } = box;
    const candles = candlesRef.current;
    const on = onRef.current;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a100e";
    ctx.fillRect(0, 0, w, h);
    if (candles.length < 2) {
      ctx.fillStyle = "#8b919c";
      ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("Cargando velas…", 16, 28);
      return;
    }

    const oscN = (on.rsi !== false ? 1 : 0) + (on.macd !== false ? 1 : 0);
    const oscH = oscN ? Math.min(132, h * 0.18) : 0;
    const padR = 78;
    const padL = 56;
    const padT = 10;
    const timeH = 32;
    const gap = oscN ? 8 : 0;
    const priceH = h - padT - timeH - oscN * oscH - gap * Math.max(0, oscN - 1) - (oscN ? 6 : 0);
    const priceTop = padT;
    const priceBot = padT + Math.max(80, priceH);
    const volH = Math.max(28, priceH * 0.16);

    let { end, count } = viewRef.current;
    count = Math.max(12, Math.min(candles.length, count));
    end = Math.max(count - 1, Math.min(end, candles.length - 1));
    viewRef.current.end = end;
    viewRef.current.count = count;
    const start = Math.max(0, end - count + 1);
    const plotW = w - padL - padR;
    const cloudExtra = on.ichimoku !== false ? 26 : 0;
    const barW = plotW / (count + cloudExtra);
    const xOf = (i: number) => padL + (i - start + 0.5) * barW;
    geomRef.current = { padL, padR, timeH, priceTop, priceBot, h, w, start, barW, minP: 0, span: 1 };

    let minP = Infinity;
    let maxP = -Infinity;
    let maxV = 0;
    for (let i = start; i <= end; i++) {
      const c = candles[i]!;
      minP = Math.min(minP, c.l);
      maxP = Math.max(maxP, c.h);
      maxV = Math.max(maxV, c.v);
    }
    const closes = candles.map((c) => c.c);
    const ichi = on.ichimoku !== false ? ichimokuCloud(candles) : null;
    const bb = on.bollinger !== false ? bollingerBands(closes) : null;
    const fit = (series: number[] | undefined, from: number, to: number) => {
      if (!series) return;
      const last = Math.min(to, series.length - 1);
      for (let i = from; i <= last; i++) {
        const v = series[i];
        if (Number.isFinite(v)) {
          minP = Math.min(minP, v!);
          maxP = Math.max(maxP, v!);
        }
      }
    };
    if (on.ema25 !== false) fit(emaSeries(closes, 25), start, end);
    if (on.ema50 !== false) fit(emaSeries(closes, 50), start, end);
    if (on.ema200 !== false) fit(emaSeries(closes, 200), start, end);
    if (bb) {
      fit(bb.upper, start, end);
      fit(bb.lower, start, end);
    }
    if (ichi) {
      const cloudTo = Math.min(end + ichi.disp, ichi.spanA.length - 1);
      fit(ichi.tenkan, start, end);
      fit(ichi.kijun, start, end);
      fit(ichi.spanA, start, cloudTo);
      fit(ichi.spanB, start, cloudTo);
      fit(ichi.chikou, start, end);
    }
    const pad = (maxP - minP) * 0.08 || 1;
    minP -= pad;
    maxP += pad;
    if (scaleRef.current.auto) {
      scaleRef.current.min = minP;
      scaleRef.current.max = maxP;
    } else {
      minP = scaleRef.current.min;
      maxP = scaleRef.current.max;
      if (!(maxP > minP)) {
        minP = scaleRef.current.min;
        maxP = minP + 1;
      }
    }
    const span = maxP - minP || 1;
    const yOf = (px: number) => priceTop + (1 - (px - minP) / span) * (priceBot - priceTop);
    geomRef.current.minP = minP;
    geomRef.current.span = span;

    ctx.fillStyle = "#101614";
    ctx.fillRect(w - padR, 0, padR, h - timeH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(w - padR + 0.5, 0);
    ctx.lineTo(w - padR + 0.5, h - timeH);
    ctx.stroke();

    ctx.strokeStyle = "rgba(61,186,154,0.08)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = priceTop + ((priceBot - priceTop) * g) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      const px = maxP - (span * g) / 4;
      ctx.fillStyle = "#c5d0c8";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtPx(px), w - padR + 10, y);
    }

    const yGripX = w - 16;
    const yGripY = (priceTop + priceBot) / 2;
    ctx.fillStyle = "rgba(232,238,245,0.16)";
    roundRect(ctx, yGripX - 11, yGripY - 14, 22, 28, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(232,238,245,0.42)";
    ctx.lineWidth = 1.4;
    for (const oy of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(yGripX - 5, yGripY + oy);
      ctx.lineTo(yGripX + 5, yGripY + oy);
      ctx.stroke();
    }

    if (on.heatmap !== false) {
      const bins = Math.max(28, Math.min(72, Math.floor((priceBot - priceTop) / 5)));
      const heat = new Float64Array(count * bins);
      const peakBox = { v: 0 };
      for (let i = start; i <= end; i++) {
        addCandleHeat(heat, i - start, bins, minP, span, candles[i]!, peakBox);
      }
      if (peakBox.v > 0) {
        const cellH = (priceBot - priceTop) / bins;
        const cellW = Math.max(1, barW);
        for (let col = 0; col < count; col++) {
          const x = padL + col * barW;
          for (let b = 0; b < bins; b++) {
            const t = heat[col * bins + b]! / peakBox.v;
            if (t < 0.04) continue;
            const y = priceBot - (b + 1) * cellH;
            const a = 0.08 + t * 0.42;
            let r = 14;
            let g = 165;
            let bl = 233;
            if (t > 0.33 && t <= 0.66) {
              const k = (t - 0.33) / 0.33;
              r = 14 + (234 - 14) * k;
              g = 165 + (179 - 165) * k;
              bl = 233 + (8 - 233) * k;
            } else if (t > 0.66) {
              const k = (t - 0.66) / 0.34;
              r = 234 + (239 - 234) * k;
              g = 179 + (68 - 179) * k;
              bl = 8 + (68 - 8) * k;
            }
            ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${a})`;
            ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
          }
        }
        const profile = new Float64Array(bins);
        let pPeak = 0;
        for (let b = 0; b < bins; b++) {
          let s = 0;
          for (let col = 0; col < count; col++) s += heat[col * bins + b]!;
          profile[b] = s;
          if (s > pPeak) pPeak = s;
        }
        const pw = 46;
        if (pPeak > 0) {
          for (let b = 0; b < bins; b++) {
            const t = profile[b]! / pPeak;
            if (t < 0.03) continue;
            const bw = t * pw;
            const y = priceBot - (b + 1) * cellH;
            ctx.fillStyle = `rgba(245,197,66,${0.12 + t * 0.38})`;
            ctx.fillRect(w - padR - bw, y, bw, cellH + 0.4);
          }
        }
      }
    }

    const clipPrice = () => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, priceTop, plotW, Math.max(0, priceBot - priceTop));
      ctx.clip();
    };

    if (ichi) {
      clipPrice();
      const cloudTo = Math.min(end + ichi.disp, ichi.spanA.length - 1);
      for (let i = start; i < cloudTo; i++) {
        const a0 = ichi.spanA[i];
        const a1 = ichi.spanA[i + 1];
        const b0 = ichi.spanB[i];
        const b1 = ichi.spanB[i + 1];
        if (![a0, a1, b0, b1].every((v) => Number.isFinite(v))) continue;
        ctx.beginPath();
        ctx.moveTo(xOf(i), yOf(a0!));
        ctx.lineTo(xOf(i + 1), yOf(a1!));
        ctx.lineTo(xOf(i + 1), yOf(b1!));
        ctx.lineTo(xOf(i), yOf(b0!));
        ctx.closePath();
        ctx.fillStyle = a0! >= b0! ? "rgba(38,166,154,0.22)" : "rgba(239,83,80,0.18)";
        ctx.fill();
      }
      ctx.restore();
    }

    for (let i = start; i <= end; i++) {
      const c = candles[i]!;
      const x = xOf(i);
      const up = c.c >= c.o;
      const col = up ? "#26a69a" : "#ef5350";
      if (maxV > 0) {
        const vh = (c.v / maxV) * volH;
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = col;
        ctx.fillRect(x - barW * 0.32, priceBot - vh, Math.max(1, barW * 0.64), vh);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      const bodyTop = yOf(Math.max(c.o, c.c));
      const bodyBot = yOf(Math.min(c.o, c.c));
      const bw = Math.max(1.2, barW * 0.62);
      ctx.fillStyle = col;
      ctx.fillRect(x - bw / 2, bodyTop, bw, Math.max(1, bodyBot - bodyTop));
    }

    const drawLine = (series: number[], color: string, width = 1.4, from = start, to = end) => {
      ctx.beginPath();
      let started = false;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      const last = Math.min(to, series.length - 1);
      for (let i = from; i <= last; i++) {
        const v = series[i];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const x = xOf(i);
        const y = yOf(v!);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    if (bb) {
      clipPrice();
      ctx.beginPath();
      let started = false;
      for (let i = start; i <= end; i++) {
        const v = bb.upper[i];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const x = xOf(i);
        const y = yOf(v!);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      for (let i = end; i >= start; i--) {
        const v = bb.lower[i];
        if (!Number.isFinite(v)) continue;
        ctx.lineTo(xOf(i), yOf(v!));
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(91,156,246,0.14)";
      ctx.fill();
      ctx.restore();
      drawLine(bb.upper, "rgba(91,156,246,0.95)", 1.15);
      drawLine(bb.lower, "rgba(91,156,246,0.95)", 1.15);
      ctx.setLineDash([5, 4]);
      drawLine(bb.mid, "#5b9cf6", 1.2);
      ctx.setLineDash([]);
    }

    if (on.ema25 !== false) drawLine(emaSeries(closes, 25), "#F5C542");
    if (on.ema50 !== false) drawLine(emaSeries(closes, 50), "#26C6DA");
    if (on.ema200 !== false) drawLine(emaSeries(closes, 200), "#EF5350");
    if (on.supertrend !== false) {
      const st = supertrend(candles);
      ctx.beginPath();
      let started = false;
      let lastDir = st.dir[start] ?? 1;
      ctx.lineWidth = 1.5;
      for (let i = start; i <= end; i++) {
        const v = st.line[i];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const dir = st.dir[i] ?? lastDir;
        if (dir !== lastDir) started = false;
        lastDir = dir;
        ctx.strokeStyle = dir === 1 ? "#26a69a" : "#ef5350";
        const x = xOf(i);
        const y = yOf(v!);
        if (!started) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
        if (i === end || st.dir[i + 1] !== dir) ctx.stroke();
      }
    }
    if (on.psar !== false) {
      const ps = parabolicSar(candles);
      for (let i = start; i <= end; i++) {
        const v = ps.line[i];
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = (ps.dir[i] ?? 1) === 1 ? "#F5C542" : "#26C6DA";
        ctx.beginPath();
        ctx.arc(xOf(i), yOf(v!), Math.max(1.4, Math.min(2.6, barW * 0.18)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (on.zigzag !== false) {
      const tf = TF[intervalRef.current] ?? "1h";
      const pts = zigzagPivots(candles, ZZ_PCT[tf] ?? 0.025);
      ctx.beginPath();
      ctx.strokeStyle = "#d1d4dc";
      ctx.lineWidth = 1.5;
      let started = false;
      for (const p of pts) {
        if (p.i < start - 2 || p.i > end + 2) continue;
        const x = xOf(p.i);
        const y = yOf(p.price);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (ichi) {
      clipPrice();
      const cloudTo = Math.min(end + ichi.disp, ichi.spanA.length - 1);
      ctx.setLineDash([4, 3]);
      drawLine(ichi.spanA, "rgba(38,166,154,0.9)", 1.05, start, cloudTo);
      drawLine(ichi.spanB, "rgba(239,83,80,0.9)", 1.05, start, cloudTo);
      ctx.setLineDash([]);
      drawLine(ichi.tenkan, "#4FC3F7", 1.45, start, end);
      drawLine(ichi.kijun, "#EC407A", 1.45, start, end);
      drawLine(ichi.chikou, "#9CCC65", 1.2, start, end);
      ctx.restore();
    }

    if (on.jerry !== false) {
      const marks = jerryMarks(
        closes,
        candles.map((c) => c.l),
        candles.map((c) => c.h),
      );
      ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const m of marks) {
        if (m.i < start || m.i > end) continue;
        const x = xOf(m.i);
        const buyish = m.kind !== "sell";
        const label = m.kind === "early" ? "▲ EARLY" : m.kind === "buy" ? "▲ BUY" : "▼ SELL";
        const tw = ctx.measureText(label).width + 10;
        const th = 14;
        const y = buyish ? yOf(m.price) + 16 : yOf(m.price) - 16;
        ctx.fillStyle = m.kind === "early" ? "rgba(165,214,84,0.92)" : buyish ? "rgba(38,166,154,0.92)" : "rgba(239,83,80,0.92)";
        roundRect(ctx, x - tw / 2, y - th / 2, tw, th, 3);
        ctx.fill();
        ctx.fillStyle = m.kind === "sell" ? "#fff" : "#04110e";
        ctx.fillText(label, x, y + 0.5);
      }
    }

    const paintOneDrawing = (d: ChartDrawing, ghost = false, selected = false) => {
      const a = { x: xOf(fracIndex(candles, d.a.t)), y: yOf(d.a.p) };
      const b = { x: xOf(fracIndex(candles, d.b.t)), y: yOf(d.b.p) };
      ctx.globalAlpha = ghost ? 0.7 : 1;
      ctx.strokeStyle = d.color;
      ctx.fillStyle = d.color;
      ctx.lineWidth = selected ? 2.15 : 1.35;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      if (d.kind === "hline") {
        ctx.beginPath();
        ctx.moveTo(padL, a.y);
        ctx.lineTo(w - padR, a.y);
        ctx.stroke();
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(fmtPx(d.a.p), padL + 6, a.y - 2);
      } else if (d.kind === "vline") {
        ctx.beginPath();
        ctx.moveTo(a.x, priceTop);
        ctx.lineTo(a.x, priceBot);
        ctx.stroke();
      } else if (d.kind === "rect") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const rw = Math.abs(b.x - a.x);
        const rh = Math.abs(b.y - a.y);
        ctx.fillStyle = hexToRgba(d.color, 0.12);
        ctx.fillRect(x, y, rw, rh);
        ctx.strokeStyle = d.color;
        ctx.strokeRect(x, y, rw, rh);
      } else if (d.kind === "ruler") {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const rw = Math.max(2, Math.abs(b.x - a.x));
        const rh = Math.max(2, Math.abs(b.y - a.y));
        const up = d.b.p >= d.a.p;
        const tone = up ? "#26a69a" : "#ef5350";
        ctx.fillStyle = up ? "rgba(38,166,154,0.16)" : "rgba(239,83,80,0.16)";
        ctx.fillRect(x, y, rw, rh);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = tone;
        ctx.strokeRect(x, y, rw, rh);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const pct = d.a.p ? ((d.b.p - d.a.p) / Math.abs(d.a.p)) * 100 : 0;
        const dp = d.b.p - d.a.p;
        const bars = Math.max(1, Math.round(Math.abs(fracIndex(candles, d.b.t) - fracIndex(candles, d.a.t))));
        const pctTxt = `${pct >= 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) >= 10 ? 2 : 3)}%`;
        const pxTxt = `${dp >= 0 ? "+" : "−"}${fmtPx(Math.abs(dp))}`;
        const barTxt = `${bars} vela${bars === 1 ? "" : "s"}`;
        ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
        const w1 = ctx.measureText(pctTxt).width;
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        const boxW = Math.max(w1, ctx.measureText(pxTxt).width, ctx.measureText(barTxt).width) + 16;
        const boxH = 42;
        let bx = x + rw / 2 - boxW / 2;
        let by = y + rh / 2 - boxH / 2;
        bx = Math.max(padL + 4, Math.min(w - padR - boxW - 4, bx));
        by = Math.max(priceTop + 4, Math.min(priceBot - boxH - 4, by));
        ctx.fillStyle = "rgba(12, 16, 28, 0.92)";
        roundRect(ctx, bx, by, boxW, boxH, 5);
        ctx.fill();
        ctx.strokeStyle = tone;
        ctx.lineWidth = 1.2;
        roundRect(ctx, bx, by, boxW, boxH, 5);
        ctx.stroke();
        ctx.fillStyle = tone;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(pctTxt, bx + boxW / 2, by + 11);
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "#d1d4dc";
        ctx.fillText(pxTxt, bx + boxW / 2, by + 24);
        ctx.fillStyle = "#868993";
        ctx.fillText(barTxt, bx + boxW / 2, by + 35);
      } else if (d.kind === "fib") {
        const lo = Math.min(d.a.p, d.b.p);
        const hi = Math.max(d.a.p, d.b.p);
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        for (const lv of FIB_LEVELS) {
          const p = hi - (hi - lo) * lv.r;
          const y = yOf(p);
          ctx.strokeStyle = lv.r === 0.5 || lv.r === 0.618 ? d.color : hexToRgba(d.color, 0.55);
          ctx.setLineDash(lv.r === 0 || lv.r === 1 ? [] : [4, 3]);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(Math.max(x1, x0 + 80), y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = d.color;
          ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(`${lv.label}  ${fmtPx(p)}`, x0 + 4, y - 1);
        }
      } else if (d.kind === "pencil" && d.pts && d.pts.length > 1) {
        ctx.beginPath();
        d.pts.forEach((pt, n) => {
          const q = { x: xOf(fracIndex(candles, pt.t)), y: yOf(pt.p) };
          if (n === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        ctx.stroke();
      } else if (d.kind === "ray") {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let tMax = 1;
        if (Math.abs(dx) + Math.abs(dy) > 0.2) {
          const ts: number[] = [];
          if (dx > 0) ts.push((w - padR - a.x) / dx);
          if (dx < 0) ts.push((padL - a.x) / dx);
          if (dy > 0) ts.push((priceBot - a.y) / dy);
          if (dy < 0) ts.push((priceTop - a.y) / dy);
          tMax = Math.max(1, ...ts.filter((t) => t > 0));
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + dx * tMax, a.y + dy * tMax);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    clipPrice();
    const selId = selectedIdRef.current;
    for (const d of drawingsOf()) paintOneDrawing(d, false, d.id === selId);
    if (draftRef.current) paintOneDrawing(draftRef.current, true);
    ctx.restore();

    const deleteHits: Array<{ x: number; y: number; r: number; id: string }> = [];
    const usedBadges: Array<{ x: number; y: number }> = [];
    const placeBadge = (x: number, y: number) => {
      let px = Math.max(padL + 12, Math.min(w - padR - 12, x));
      let py = Math.max(priceTop + 12, Math.min(priceBot - 12, y));
      for (let n = 0; n < 10; n++) {
        if (!usedBadges.some((u) => Math.hypot(u.x - px, u.y - py) < 15)) break;
        py = Math.max(priceTop + 12, py - 15);
      }
      usedBadges.push({ x: px, y: py });
      return { x: px, y: py };
    };
    ctx.globalAlpha = 1;
    for (const d of drawingsOf()) {
      const a = { x: xOf(fracIndex(candles, d.a.t)), y: yOf(d.a.p) };
      const b = { x: xOf(fracIndex(candles, d.b.t)), y: yOf(d.b.p) };
      let hx = Math.max(a.x, b.x);
      let hy = Math.min(a.y, b.y);
      if (d.kind === "hline") {
        hx = w - padR - 14;
        hy = a.y;
      } else if (d.kind === "vline") {
        hx = a.x;
        hy = priceTop + 14;
      } else if (d.kind === "pencil" && d.pts && d.pts.length) {
        const last = d.pts[d.pts.length - 1]!;
        hx = xOf(fracIndex(candles, last.t));
        hy = yOf(last.p);
      }
      const p = placeBadge(hx, hy);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ef5350";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 3.1, p.y - 3.1);
      ctx.lineTo(p.x + 3.1, p.y + 3.1);
      ctx.moveTo(p.x + 3.1, p.y - 3.1);
      ctx.lineTo(p.x - 3.1, p.y + 3.1);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      ctx.stroke();
      deleteHits.push({ x: p.x, y: p.y, r: 13, id: d.id });
    }
    deleteHitsRef.current = deleteHits;

    {
      const lastC = candles[candles.length - 1]!;
      const lastPx = lastC.c;
      const lastUp = lastC.c >= lastC.o;
      let visHi = -Infinity;
      let visLo = Infinity;
      for (let i = start; i <= end; i++) {
        visHi = Math.max(visHi, candles[i]!.h);
        visLo = Math.min(visLo, candles[i]!.l);
      }
      const clampY = (px: number) => Math.min(priceBot, Math.max(priceTop, yOf(px)));
      const marks: Array<{ px: number; y: number; bg: string; fg: string; dash: string; text: string; w: number }> = [];
      const addMark = (px: number, bg: string, fg: string, dash: string, text: string) => {
        if (!Number.isFinite(px)) return;
        ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
        marks.push({
          px,
          y: clampY(px),
          bg,
          fg,
          dash,
          text,
          w: Math.max(padR - 6, ctx.measureText(text).width + 12),
        });
      };
      if (Number.isFinite(visHi)) addMark(visHi, "rgba(245, 197, 66, 0.95)", "#1a1404", "rgba(245,197,66,0.55)", fmtPx(visHi));
      if (Number.isFinite(visLo)) addMark(visLo, "rgba(38, 198, 218, 0.95)", "#041016", "rgba(38,198,218,0.5)", fmtPx(visLo));
      addMark(
        lastPx,
        lastUp ? "rgba(38, 166, 154, 0.98)" : "rgba(239, 83, 80, 0.98)",
        lastUp ? "#04110e" : "#fff",
        lastUp ? "rgba(38,166,154,0.85)" : "rgba(239,83,80,0.85)",
        fmtPx(lastPx),
      );
      marks.sort((a, b) => a.y - b.y);
      for (let i = 1; i < marks.length; i++) {
        const gap = marks[i]!.y - marks[i - 1]!.y;
        if (gap < 18) {
          const push = (18 - gap) / 2;
          marks[i - 1]!.y = Math.max(priceTop + 9, marks[i - 1]!.y - push);
          marks[i]!.y = Math.min(priceBot - 9, marks[i]!.y + push);
        }
      }
      for (const m of marks) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = m.dash;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(padL, m.y);
        ctx.lineTo(w - padR, m.y);
        ctx.stroke();
        ctx.setLineDash([]);
        roundRect(ctx, w - padR + 2, m.y - 9, padR - 6, 18, 3);
        ctx.fillStyle = m.bg;
        ctx.fill();
        ctx.fillStyle = m.fg;
        ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.text, w - padR + (padR - 6) / 2 + 2, m.y + 0.5);
      }
    }

    let oscTop = priceBot + 6;
    const macd = on.macd !== false ? macdSeries(closes) : null;
    const rsi = on.rsi !== false ? rsiWilder(closes, 14) : null;
    const readI = hoverRef.current != null && hoverRef.current >= start && hoverRef.current <= end ? hoverRef.current : end;

    const paintOscTag = (y: number, bg: string, fg: string, text: string) => {
      const yy = Math.min(oscTop + oscH - 8, Math.max(oscTop + 8, y));
      roundRect(ctx, w - padR + 2, yy - 8, padR - 6, 16, 3);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w - padR + (padR - 6) / 2 + 2, yy + 0.5);
    };

    if (macd) {
      let mn = 0;
      let mx = 0;
      for (let i = start; i <= end; i++) {
        const hst = macd.hist[i];
        const ml = macd.macd[i];
        const sg = macd.signal[i];
        for (const v of [hst, ml, sg]) {
          if (!Number.isFinite(v)) continue;
          mn = Math.min(mn, v!);
          mx = Math.max(mx, v!);
        }
      }
      const sp = mx - mn || 1;
      const yM = (v: number) => oscTop + (1 - (v - mn) / sp) * oscH;
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(padL, oscTop, plotW, oscH);
      ctx.strokeStyle = "rgba(139,145,156,0.35)";
      ctx.beginPath();
      ctx.moveTo(padL, yM(0));
      ctx.lineTo(w - padR, yM(0));
      ctx.stroke();
      for (let i = start; i <= end; i++) {
        const hv = macd.hist[i];
        if (!Number.isFinite(hv)) continue;
        const x = xOf(i);
        const y0 = yM(0);
        const y1 = yM(hv!);
        ctx.fillStyle = hv! >= 0 ? "#26a69a" : "#ef5350";
        ctx.fillRect(x - barW * 0.28, Math.min(y0, y1), Math.max(1, barW * 0.56), Math.max(1, Math.abs(y1 - y0)));
      }
      const strokeOsc = (series: number[], color: string) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        let started = false;
        for (let i = start; i <= end; i++) {
          const v = series[i];
          if (!Number.isFinite(v)) {
            started = false;
            continue;
          }
          const x = xOf(i);
          const y = yM(v!);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      strokeOsc(macd.macd, "#26C6DA");
      strokeOsc(macd.signal, "#F5C542");
      const mLine = lastFiniteAt(macd.macd, readI);
      const mSig = lastFiniteAt(macd.signal, readI);
      const mHist = lastFiniteAt(macd.hist, readI);
      ctx.fillStyle = "rgba(10,16,14,0.82)";
      ctx.fillRect(padL, oscTop, plotW, 18);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      let lx = padL + 8;
      const yLeg = oscTop + 9;
      ctx.fillStyle = "#8b919c";
      ctx.fillText("MACD 12,26,9", lx, yLeg);
      lx += ctx.measureText("MACD 12,26,9").width + 16;
      const stamp = (label: string, value: string, color: string) => {
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "#8b919c";
        ctx.fillText(label, lx, yLeg);
        lx += ctx.measureText(label).width + 5;
        ctx.fillStyle = color;
        ctx.font = "800 11px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(value, lx, yLeg);
        lx += ctx.measureText(value).width + 14;
      };
      stamp("MACD", fmtOsc(mLine), "#26C6DA");
      stamp("Signal", fmtOsc(mSig), "#F5C542");
      stamp("Hist", fmtOsc(mHist), mHist >= 0 ? "#26a69a" : "#ef5350");
      ctx.fillStyle = "#8b919c";
      ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("0", w - padR + 8, yM(0));
      if (Number.isFinite(mLine)) paintOscTag(yM(mLine), "rgba(38,198,218,0.95)", "#041016", fmtOsc(mLine));
      if (Number.isFinite(mSig) && Math.abs(yM(mSig) - yM(mLine)) > 14) {
        paintOscTag(yM(mSig), "rgba(245,197,66,0.95)", "#1a1404", fmtOsc(mSig));
      }
      if (Number.isFinite(mHist)) {
        paintOscTag(yM(mHist), mHist >= 0 ? "rgba(38,166,154,0.95)" : "rgba(239,83,80,0.95)", "#fff", fmtOsc(mHist));
      }
      oscTop += oscH + gap;
    }

    if (rsi) {
      const yR = (v: number) => oscTop + (1 - v / 100) * oscH;
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(padL, oscTop, plotW, oscH);
      ctx.strokeStyle = "rgba(171,71,188,0.25)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, yR(70));
      ctx.lineTo(w - padR, yR(70));
      ctx.moveTo(padL, yR(30));
      ctx.lineTo(w - padR, yR(30));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.strokeStyle = "#ab47bc";
      ctx.lineWidth = 1.4;
      let started = false;
      for (let i = start; i <= end; i++) {
        const v = rsi[i];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const x = xOf(i);
        const y = yR(v!);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const rNow = lastFiniteAt(rsi, readI);
      const rZone = rNow >= 70 ? "Sobrecompra" : rNow <= 30 ? "Sobreventa" : "Neutro";
      ctx.fillStyle = "rgba(10,16,14,0.82)";
      ctx.fillRect(padL, oscTop, plotW, 18);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      const yLegR = oscTop + 9;
      ctx.fillStyle = "#8b919c";
      ctx.fillText("RSI 14", padL + 8, yLegR);
      ctx.font = "800 12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = rNow >= 70 ? "#ef5350" : rNow <= 30 ? "#26a69a" : "#ce93d8";
      ctx.fillText(Number.isFinite(rNow) ? rNow.toFixed(1) : "—", padL + 58, yLegR);
      ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#8b919c";
      ctx.fillText(rZone, padL + 108, yLegR);
      ctx.fillStyle = "rgba(171,71,188,0.85)";
      ctx.font = "700 9px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("70", w - padR + 8, yR(70));
      ctx.fillText("50", w - padR + 8, yR(50));
      ctx.fillText("30", w - padR + 8, yR(30));
      if (Number.isFinite(rNow)) {
        paintOscTag(
          yR(rNow),
          rNow >= 70 ? "rgba(239,83,80,0.95)" : rNow <= 30 ? "rgba(38,166,154,0.95)" : "rgba(171,71,188,0.95)",
          "#fff",
          rNow.toFixed(1),
        );
      }
    }

    ctx.fillStyle = "#101614";
    ctx.fillRect(0, h - timeH, w, timeH);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - timeH + 0.5);
    ctx.lineTo(w, h - timeH + 0.5);
    ctx.stroke();

    ctx.fillStyle = "#8b919c";
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const step = Math.max(1, Math.round(count / 6));
    for (let i = start; i <= end; i += step) {
      const x = xOf(i);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(x, h - timeH + 1);
      ctx.lineTo(x, h - timeH + 7);
      ctx.stroke();
      ctx.fillStyle = "#9aa3a0";
      ctx.fillText(fmtTime(candles[i]!.t, intervalRef.current), x, h - timeH / 2 + 3);
    }

    const gripX = w - padR + 18;
    const gripY = h - timeH / 2;
    ctx.fillStyle = "rgba(232,238,245,0.18)";
    roundRect(ctx, gripX - 11, gripY - 9, 22, 18, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(232,238,245,0.45)";
    ctx.lineWidth = 1.4;
    for (const ox of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(gripX + ox, gripY - 5);
      ctx.lineTo(gripX + ox, gripY + 5);
      ctx.stroke();
    }

    const hover = hoverRef.current;
    if (hover != null && hover >= start && hover <= end) {
      const c = candles[hover]!;
      const x = xOf(hover);
      ctx.strokeStyle = "rgba(232,238,245,0.28)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, priceTop);
      ctx.lineTo(x, priceBot);
      ctx.stroke();
      ctx.setLineDash([]);
      const y = yOf(c.c);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.strokeStyle = "rgba(232,238,245,0.18)";
      ctx.stroke();
      ctx.fillStyle = "rgba(10,16,14,0.88)";
      const extra = (macd ? 18 : 0) + (rsi ? 18 : 0);
      roundRect(ctx, padL + 6, priceTop + 6, 268, 52 + extra, 6);
      ctx.fill();
      ctx.fillStyle = "#e8eef5";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fmtTime(c.t, intervalRef.current), padL + 14, priceTop + 12);
      ctx.fillStyle = c.c >= c.o ? "#26a69a" : "#ef5350";
      ctx.fillText(`O ${fmtPx(c.o)}  H ${fmtPx(c.h)}  L ${fmtPx(c.l)}  C ${fmtPx(c.c)}`, padL + 14, priceTop + 32);
      let ty = priceTop + 50;
      if (macd) {
        const ml = lastFiniteAt(macd.macd, hover);
        const sg = lastFiniteAt(macd.signal, hover);
        const hs = lastFiniteAt(macd.hist, hover);
        ctx.fillStyle = "#8b919c";
        ctx.fillText("MACD", padL + 14, ty);
        ctx.fillStyle = "#26C6DA";
        ctx.fillText(fmtOsc(ml), padL + 58, ty);
        ctx.fillStyle = "#F5C542";
        ctx.fillText(fmtOsc(sg), padL + 118, ty);
        ctx.fillStyle = hs >= 0 ? "#26a69a" : "#ef5350";
        ctx.fillText(fmtOsc(hs), padL + 178, ty);
        ty += 18;
      }
      if (rsi) {
        const rv = lastFiniteAt(rsi, hover);
        ctx.fillStyle = "#ce93d8";
        ctx.fillText(`RSI ${Number.isFinite(rv) ? rv.toFixed(1) : "—"}`, padL + 14, ty);
      }
    }
  }

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const axisY = axisYRef.current;
    const axisX = axisXRef.current;
    if (!canvas || !axisY || !axisX) return;

    const barWidth = () => {
      const wrap = wrapRef.current;
      const n = Math.max(12, viewRef.current.count);
      const g = geomRef.current;
      const w = (wrap?.clientWidth ?? 800) - g.padL - g.padR;
      return w / n;
    };

    const begin = (mode: "pan" | "zoomX" | "zoomY", e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        x: e.clientX,
        y: e.clientY,
        end: viewRef.current.end,
        count: viewRef.current.count,
        min: scaleRef.current.min,
        max: scaleRef.current.max,
      };
    };

    const move = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      const g = geomRef.current;
      if (wrap && dragRef.current?.mode === "pan") {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const { end, count } = viewRef.current;
        const start = Math.max(0, end - count + 1);
        const plotW = wrap.clientWidth - g.padL - g.padR;
        const i = start + Math.floor(((x - g.padL) / plotW) * count);
        hoverRef.current = Math.max(start, Math.min(end, i));
      }
      const drag = dragRef.current;
      if (!drag) {
        paint();
        return;
      }
      const rows = candlesRef.current.length;
      if (drag.mode === "zoomX") {
        const dx = e.clientX - drag.x;
        const factor = Math.pow(1.012, -dx);
        const next = Math.round(Math.min(rows, Math.max(12, drag.count * factor)));
        viewRef.current.count = next;
        viewRef.current.end = Math.max(next - 1, Math.min(rows - 1, drag.end));
        viewRef.current.follow = viewRef.current.end >= rows - 2;
      } else if (drag.mode === "zoomY") {
        const dy = e.clientY - drag.y;
        const factor = Math.pow(1.012, -dy);
        const mid = (drag.min + drag.max) / 2;
        const span = Math.max(1e-8, (drag.max - drag.min) * factor);
        scaleRef.current.auto = false;
        scaleRef.current.min = mid - span / 2;
        scaleRef.current.max = mid + span / 2;
      } else {
        const shift = Math.round(-(e.clientX - drag.x) / barWidth());
        const count = viewRef.current.count;
        const next = Math.max(count - 1, Math.min(rows - 1, drag.end + shift));
        viewRef.current.end = next;
        viewRef.current.follow = next >= rows - 2;
      }
      paint();
    };

    const end = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      const draft = draftRef.current;
      const tool = drawToolRef.current;
      if (draft && tool !== "cursor" && tool !== "eraser") {
        const pt = fromEvent(e) ?? draft.b;
        draft.b = pt;
        if (draft.kind === "pencil") {
          if ((draft.pts?.length ?? 0) > 1) {
            drawingsOf().push(draft);
            selectedIdRef.current = draft.id;
          }
        } else {
          drawingsOf().push(draft);
          selectedIdRef.current = draft.id;
        }
        draftRef.current = null;
        paint();
      }
      dragRef.current = null;
    };

    const wheelY = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const mid = (scaleRef.current.min + scaleRef.current.max) / 2;
      const span = Math.max(1e-8, (scaleRef.current.max - scaleRef.current.min) * factor);
      scaleRef.current.auto = false;
      scaleRef.current.min = mid - span / 2;
      scaleRef.current.max = mid + span / 2;
      paint();
    };
    const wheelX = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const v = viewRef.current;
      const rows = candlesRef.current.length;
      const factor = e.deltaY > 0 ? 1.12 : 0.88;
      v.count = Math.round(Math.max(12, Math.min(rows, v.count * factor)));
      if (v.follow) v.end = rows - 1;
      paint();
    };

    const hitDrawingAt = (x: number, y: number) => {
      const list = drawingsOf();
      const g = geomRef.current;
      let best = -1;
      let dist = 11;
      for (let idx = 0; idx < list.length; idx++) {
        const d = list[idx]!;
        const a = toXy(d.a);
        const b = toXy(d.b);
        let dd = distToSeg(x, y, a.x, a.y, b.x, b.y);
        if (d.kind === "hline") dd = Math.abs(y - a.y);
        else if (d.kind === "vline") dd = Math.abs(x - a.x);
        else if (d.kind === "pencil" && d.pts && d.pts.length > 1) dd = distToPoly(x, y, d.pts.map(toXy));
        else if (d.kind === "rect" || d.kind === "ruler") {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          const y0 = Math.min(a.y, b.y);
          const y1 = Math.max(a.y, b.y);
          const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
          dd = inside
            ? 0
            : Math.min(
                distToSeg(x, y, a.x, a.y, b.x, a.y),
                distToSeg(x, y, b.x, a.y, b.x, b.y),
                distToSeg(x, y, b.x, b.y, a.x, b.y),
                distToSeg(x, y, a.x, b.y, a.x, a.y),
              );
        } else if (d.kind === "fib") {
          const lo = Math.min(d.a.p, d.b.p);
          const hi = Math.max(d.a.p, d.b.p);
          const x0 = Math.min(a.x, b.x) - 4;
          const x1 = Math.max(a.x, b.x) + 84;
          dd = Infinity;
          for (const lv of FIB_LEVELS) {
            const p = hi - (hi - lo) * lv.r;
            const yy = g.priceTop + (1 - (p - g.minP) / Math.max(1e-12, g.span)) * (g.priceBot - g.priceTop);
            if (x >= x0 && x <= x1) dd = Math.min(dd, Math.abs(y - yy));
          }
        }
        if (dd < dist) {
          dist = dd;
          best = idx;
        }
      }
      return best;
    };

    const eraseAt = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const list = drawingsOf();
      const best = hitDrawingAt(x, y);
      if (best >= 0) {
        if (selectedIdRef.current === list[best]!.id) selectedIdRef.current = null;
        list.splice(best, 1);
      }
    };

    const onCanvasDown = (e: PointerEvent) => {
      const tool = drawToolRef.current;
      downRef.current = { x: e.clientX, y: e.clientY, tool };
      const wrap = wrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hits = deleteHitsRef.current;
        let hitId: string | null = null;
        let bestD = 99;
        for (let i = hits.length - 1; i >= 0; i--) {
          const badge = hits[i]!;
          const dd = Math.hypot(x - badge.x, y - badge.y);
          if (dd <= badge.r && dd <= bestD) {
            bestD = dd;
            hitId = badge.id;
          }
        }
        if (hitId) {
          const list = drawingsOf();
          const i = list.findIndex((d) => d.id === hitId);
          if (i >= 0) list.splice(i, 1);
          if (selectedIdRef.current === hitId) selectedIdRef.current = null;
          paint();
          return;
        }
      }
      if (tool === "cursor") {
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          const hit = hitDrawingAt(e.clientX - rect.left, e.clientY - rect.top);
          if (hit >= 0) {
            selectedIdRef.current = drawingsOf()[hit]!.id;
            paint();
            return;
          }
        }
        selectedIdRef.current = null;
        begin("pan", e);
        return;
      }
      if (tool === "eraser") {
        eraseAt(e);
        paint();
        return;
      }
      const pt = fromEvent(e);
      if (!pt) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const color = drawColorRef.current;
      selectedIdRef.current = null;
      if (tool === "hline" || tool === "vline") {
        const row = { id: String(Date.now()), kind: tool, a: pt, b: pt, color };
        drawingsOf().push(row);
        selectedIdRef.current = row.id;
        draftRef.current = null;
        paint();
        return;
      }
      draftRef.current = {
        id: String(Date.now()),
        kind: tool,
        a: pt,
        b: pt,
        pts: tool === "pencil" ? [pt] : undefined,
        color,
      };
      paint();
    };
    const onYDown = (e: PointerEvent) => {
      e.stopPropagation();
      begin("zoomY", e);
    };
    const onXDown = (e: PointerEvent) => {
      e.stopPropagation();
      begin("zoomX", e);
    };
    const onCanvasMove = (e: PointerEvent) => {
      const draft = draftRef.current;
      if (draft) {
        const pt = fromEvent(e);
        if (pt) {
          draft.b = pt;
          if (draft.kind === "pencil") {
            const last = draft.pts?.[draft.pts.length - 1];
            if (last) {
              const A = toXy(last);
              const B = toXy(pt);
              if (Math.hypot(A.x - B.x, A.y - B.y) >= 2.5) (draft.pts ??= []).push(pt);
            } else (draft.pts ??= []).push(pt);
          }
          paint();
        }
        return;
      }
      if (drawToolRef.current === "eraser" && downRef.current?.tool === "eraser") {
        eraseAt(e);
        paint();
        return;
      }
      const wrap = wrapRef.current;
      if (wrap && !dragRef.current) {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const { end, count } = viewRef.current;
        const start = Math.max(0, end - count + 1);
        const g = geomRef.current;
        const plotW = wrap.clientWidth - g.padL - g.padR;
        const i = start + Math.floor(((x - g.padL) / plotW) * count);
        hoverRef.current = Math.max(start, Math.min(end, i));
        paint();
        const y = e.clientY - rect.top;
        const overX = deleteHitsRef.current.some((b) => Math.hypot(x - b.x, y - b.y) <= b.r);
        if (overX && canvasRef.current) canvasRef.current.style.cursor = "pointer";
      }
      move(e);
    };
    const onCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelX(e);
    };
    const onYDbl = (e: MouseEvent) => {
      e.preventDefault();
      scaleRef.current.auto = true;
      paint();
    };
    const onXDbl = (e: MouseEvent) => {
      e.preventDefault();
      const live = intervalRef.current === "LIVE";
      const rows = candlesRef.current.length;
      viewRef.current.count = Math.min(rows, live ? 180 : 120);
      if (viewRef.current.follow) viewRef.current.end = Math.max(0, rows - 1);
      paint();
    };
    const onLeave = () => {
      hoverRef.current = null;
      paint();
    };
    const onEsc = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "Escape") {
        draftRef.current = null;
        selectedIdRef.current = null;
        paint();
        return;
      }
      if (typing) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      const list = drawingsOf();
      const sel = selectedIdRef.current;
      const idx = sel ? list.findIndex((d) => d.id === sel) : -1;
      if (idx >= 0) list.splice(idx, 1);
      else list.pop();
      selectedIdRef.current = null;
      draftRef.current = null;
      paint();
    };

    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("pointermove", onCanvasMove);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onEsc);
    axisY.addEventListener("pointerdown", onYDown);
    axisY.addEventListener("pointermove", move);
    axisY.addEventListener("pointerup", end);
    axisY.addEventListener("pointercancel", end);
    axisY.addEventListener("wheel", wheelY, { passive: false });
    axisY.addEventListener("dblclick", onYDbl);
    axisX.addEventListener("pointerdown", onXDown);
    axisX.addEventListener("pointermove", move);
    axisX.addEventListener("pointerup", end);
    axisX.addEventListener("pointercancel", end);
    axisX.addEventListener("wheel", wheelX, { passive: false });
    axisX.addEventListener("dblclick", onXDbl);
    return () => {
      canvas.removeEventListener("pointerdown", onCanvasDown);
      canvas.removeEventListener("pointermove", onCanvasMove);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("wheel", onCanvasWheel);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onEsc);
      axisY.removeEventListener("pointerdown", onYDown);
      axisY.removeEventListener("pointermove", move);
      axisY.removeEventListener("pointerup", end);
      axisY.removeEventListener("pointercancel", end);
      axisY.removeEventListener("wheel", wheelY);
      axisY.removeEventListener("dblclick", onYDbl);
      axisX.removeEventListener("pointerdown", onXDown);
      axisX.removeEventListener("pointermove", move);
      axisX.removeEventListener("pointerup", end);
      axisX.removeEventListener("pointercancel", end);
      axisX.removeEventListener("wheel", wheelX);
      axisX.removeEventListener("dblclick", onXDbl);
    };
  }, []);

  return (
    <div className="tv-markets-native" ref={wrapRef}>
      <canvas ref={canvasRef} className="tv-markets-native__canvas" />
      <div
        ref={axisYRef}
        className="tv-markets-axis tv-markets-axis--y"
        title="Arrastrar para zoom vertical"
      />
      <div
        ref={axisXRef}
        className="tv-markets-axis tv-markets-axis--x"
        title="Arrastrar para zoom horizontal"
      />
    </div>
  );
}
