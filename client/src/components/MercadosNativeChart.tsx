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
  type MarketCandle,
} from "../lib/mercadosChartMath";

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

const WS_KLINE = (symbol: string, tf: string) =>
  `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${tf}`;

type Studies = Record<string, boolean>;

type Props = {
  binance: string;
  interval: string;
  studyOn: Studies;
};

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

async function fetchCandles(binance: string, interval: string): Promise<MarketCandle[]> {
  const tf = TF[interval] ?? "1h";
  const limit = interval === "LIVE" ? 1000 : 500;
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
      if (next.length >= 40) return next;
    } catch {
      /* next host */
    }
  }
  if (interval === "LIVE") return fetchCandles(binance, "1");
  return [];
}

export function MercadosNativeChart({ binance, interval, studyOn }: Props) {
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
  const geomRef = useRef({ padL: 56, padR: 78, timeH: 32, priceTop: 10, priceBot: 0, h: 0, w: 0 });
  const axisYRef = useRef<HTMLDivElement>(null);
  const axisXRef = useRef<HTMLDivElement>(null);
  const onRef = useRef(studyOn);
  onRef.current = studyOn;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  const studiesKey = useMemo(() => JSON.stringify(studyOn), [studyOn]);

  useEffect(() => {
    let dead = false;
    const live = interval === "LIVE";
    viewRef.current.count = live ? 180 : 120;
    viewRef.current.follow = true;
    scaleRef.current.auto = true;

    const applyRows = (rows: MarketCandle[]) => {
      if (dead || rows.length < 2) return;
      const prev = candlesRef.current;
      candlesRef.current = rows;
      const v = viewRef.current;
      if (v.follow || prev.length === 0) {
        v.end = Math.max(0, rows.length - 1);
        v.follow = true;
      } else {
        v.end = Math.min(v.end, Math.max(0, rows.length - 1));
      }
      paint();
    };

    const upsert = (c: MarketCandle) => {
      if (dead) return;
      const rows = candlesRef.current.slice();
      const last = rows[rows.length - 1];
      if (last && last.t === c.t) rows[rows.length - 1] = c;
      else if (!last || c.t > last.t) {
        rows.push(c);
        if (rows.length > 1200) rows.splice(0, rows.length - 1000);
      } else return;
      candlesRef.current = rows;
      if (viewRef.current.follow) viewRef.current.end = rows.length - 1;
      paint();
    };

    const pull = async () => {
      const rows = await fetchCandles(binance, interval);
      applyRows(rows);
    };

    let ws: WebSocket | null = null;
    void pull().then(() => {
      if (dead || !live) return;
      const rows = candlesRef.current;
      const dt = rows.length >= 2 ? rows[rows.length - 1]!.t - rows[rows.length - 2]!.t : 60_000;
      const streamTf = dt <= 2500 ? "1s" : "1m";
      try {
        if (dead) return;
        ws = new WebSocket(WS_KLINE(binance, streamTf));
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
    const pollMs = live ? 4000 : 15000;
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
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studiesKey]);

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
    const oscH = oscN ? Math.min(118, h * 0.16) : 0;
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
    const barW = plotW / count;
    const xOf = (i: number) => padL + (i - start + 0.5) * barW;
    geomRef.current = { padL, padR, timeH, priceTop, priceBot, h, w };

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
    if (on.ema25 !== false) {
      const s = emaSeries(closes, 25);
      for (let i = start; i <= end; i++) if (Number.isFinite(s[i])) {
        minP = Math.min(minP, s[i]!);
        maxP = Math.max(maxP, s[i]!);
      }
    }
    if (on.ema50 !== false) {
      const s = emaSeries(closes, 50);
      for (let i = start; i <= end; i++) if (Number.isFinite(s[i])) {
        minP = Math.min(minP, s[i]!);
        maxP = Math.max(maxP, s[i]!);
      }
    }
    if (on.ema200 !== false) {
      const s = emaSeries(closes, 200);
      for (let i = start; i <= end; i++) if (Number.isFinite(s[i])) {
        minP = Math.min(minP, s[i]!);
        maxP = Math.max(maxP, s[i]!);
      }
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
      let peak = 0;
      for (let i = start; i <= end; i++) {
        const c = candles[i]!;
        const vol = Math.max(0, c.v);
        if (vol <= 0) continue;
        const lo = Math.min(c.l, c.h);
        const hi = Math.max(c.l, c.h);
        let b0 = Math.floor(((lo - minP) / span) * bins);
        let b1 = Math.floor(((hi - minP) / span) * bins);
        b0 = Math.max(0, Math.min(bins - 1, b0));
        b1 = Math.max(0, Math.min(bins - 1, b1));
        if (b1 < b0) {
          const t = b0;
          b0 = b1;
          b1 = t;
        }
        const n = b1 - b0 + 1;
        const share = vol / n;
        const col = i - start;
        for (let b = b0; b <= b1; b++) {
          const closeBin = Math.floor(((c.c - minP) / span) * bins);
          const wgt = b === Math.max(0, Math.min(bins - 1, closeBin)) ? 1.35 : 1;
          const v = heat[col * bins + b]! + share * wgt;
          heat[col * bins + b] = v;
          if (v > peak) peak = v;
        }
      }
      if (peak > 0) {
        const cellH = (priceBot - priceTop) / bins;
        const cellW = Math.max(1, barW);
        for (let col = 0; col < count; col++) {
          const x = padL + col * barW;
          for (let b = 0; b < bins; b++) {
            const t = heat[col * bins + b]! / peak;
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

    const drawLine = (series: number[], color: string, width = 1.4) => {
      ctx.beginPath();
      let started = false;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (let i = start; i <= end; i++) {
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
    if (on.macd !== false) {
      const macd = macdSeries(closes);
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
      ctx.fillStyle = "#8b919c";
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("MACD", padL + 4, oscTop + 3);
      oscTop += oscH + gap;
    }

    if (on.rsi !== false) {
      const rsi = rsiWilder(closes, 14);
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
      ctx.fillStyle = "#8b919c";
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("RSI", padL + 4, oscTop + 3);
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
      roundRect(ctx, padL + 6, priceTop + 6, 210, 52, 6);
      ctx.fill();
      ctx.fillStyle = "#e8eef5";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fmtTime(c.t, intervalRef.current), padL + 14, priceTop + 12);
      ctx.fillStyle = c.c >= c.o ? "#26a69a" : "#ef5350";
      ctx.fillText(`O ${fmtPx(c.o)}  H ${fmtPx(c.h)}  L ${fmtPx(c.l)}  C ${fmtPx(c.c)}`, padL + 14, priceTop + 32);
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

    const onCanvasDown = (e: PointerEvent) => begin("pan", e);
    const onYDown = (e: PointerEvent) => {
      e.stopPropagation();
      begin("zoomY", e);
    };
    const onXDown = (e: PointerEvent) => {
      e.stopPropagation();
      begin("zoomX", e);
    };
    const onCanvasMove = (e: PointerEvent) => {
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

    canvas.addEventListener("pointerdown", onCanvasDown);
    canvas.addEventListener("pointermove", onCanvasMove);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
    canvas.addEventListener("pointerleave", onLeave);
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
