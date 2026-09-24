import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { TradingViewEmbed } from "../components/TradingViewEmbed";
import { useAuth } from "../contexts/AuthContext";
import { getBtcTradeSignal, type BtcTradeSignal } from "../lib/api";
import { sgiHome } from "../lib/marketplacePaths.js";
import { canUserAccessNavPath } from "../lib/sgiNavigation";
import "../styles/facturacion.css";
import "../styles/mercados-trading.css";

const PATH = "/gestion-administrativa/mercados";

const SYMBOLS = [
  { id: "BINANCE:BTCUSDT", binance: "BTCUSDT", label: "BTC", name: "Bitcoin", quote: "USDT", logo: "btc" },
  { id: "BINANCE:ETHUSDT", binance: "ETHUSDT", label: "ETH", name: "Ethereum", quote: "USDT", logo: "eth" },
  { id: "BINANCE:LTCUSDT", binance: "LTCUSDT", label: "LTC", name: "Litecoin", quote: "USDT", logo: "ltc" },
  { id: "BINANCE:DOGEUSDT", binance: "DOGEUSDT", label: "DOGE", name: "Dogecoin", quote: "USDT", logo: "doge" },
  { id: "BINANCE:ZECUSDT", binance: "ZECUSDT", label: "ZEC", name: "Zcash", quote: "USDT", logo: "zec" },
  { id: "BINANCE:SOLUSDT", binance: "SOLUSDT", label: "SOL", name: "Solana", quote: "USDT", logo: "sol" },
] as const;

const TAPE_LOGO = (slug: string) =>
  `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${slug}.png`;

const TAPE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com", "https://api.binance.us"];

type TapeQuote = { last: number; changePct: number };

function formatTapePrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

async function fetchTapeQuotes(): Promise<Record<string, TapeQuote>> {
  const symbols = encodeURIComponent(JSON.stringify(SYMBOLS.map((s) => s.binance)));
  let lastErr: Error | null = null;
  for (const host of TAPE_HOSTS) {
    try {
      const res = await fetch(`${host}/api/v3/ticker/24hr?symbols=${symbols}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: unknown = await res.json();
      if (!Array.isArray(raw)) throw new Error("ticker inválido");
      const out: Record<string, TapeQuote> = {};
      for (const row of raw) {
        if (!row || typeof row !== "object") continue;
        const o = row as { symbol?: string; lastPrice?: string; priceChangePercent?: string };
        if (!o.symbol) continue;
        out[o.symbol] = { last: Number(o.lastPrice), changePct: Number(o.priceChangePercent) };
      }
      return out;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Sin precios");
}

const INTERVALS = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "30", label: "30m" },
  { id: "60", label: "1h" },
  { id: "240", label: "4h" },
  { id: "D", label: "1D" },
] as const;

const CHART_STUDIES = [
  { key: "ema25", label: "EMA 25", hint: "Media rápida", spec: { id: "MAExp@tv-basicstudies", inputs: { length: 25, source: "close" }, styles: { "plot.color": "#F5C542" } } },
  { key: "ema50", label: "EMA 50", hint: "Media intermedia", spec: { id: "MAExp@tv-basicstudies", inputs: { length: 50, source: "close" }, styles: { "plot.color": "#26C6DA" } } },
  { key: "ema200", label: "EMA 200", hint: "Régimen / tendencia", spec: { id: "MAExp@tv-basicstudies", inputs: { length: 200, source: "close" }, styles: { "plot.color": "#EF5350" } } },
  { key: "supertrend", label: "Supertrend", hint: "Sesgo y stop", spec: { id: "STD;Supertrend" } },
  { key: "psar", label: "Parabolic SAR", hint: "Puntos 0.02 / 0.02 / 0.2", spec: { id: "PSAR@tv-basicstudies", inputs: { start: 0.02, increment: 0.02, maximum: 0.2 } } },
  { key: "macd", label: "MACD", hint: "Histograma y cruce 12/26/9", spec: { id: "MACD@tv-basicstudies" } },
  { key: "rsi", label: "RSI", hint: "Sobrecompra / venta", spec: { id: "RSI@tv-basicstudies" } },
  { key: "zigzag", label: "ZigZag", hint: "Swings high/low", spec: { id: "STD;Zig_Zag" } },
  { key: "div", label: "Divergencias MACD", hint: "Comparar extremos de precio vs MACD" },
  { key: "jerry", label: "Jerry Buy Sell", hint: "Early buy / buy / sell vs línea cero" },
] as const;

function StudyGlyph({ kind }: { kind: (typeof CHART_STUDIES)[number]["key"] }) {
  const common = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", "aria-hidden": true as const };
  if (kind === "ema25") {
    return (
      <svg {...common}>
        <path d="M2 13c3-1 4-7 7-7s3 6 7 5" stroke="#F5C542" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "ema50") {
    return (
      <svg {...common}>
        <path d="M2 12c4-.5 5-4 8-4s3 4 6 3.2" stroke="#26C6DA" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "ema200") {
    return (
      <svg {...common}>
        <path d="M2 11c5 0 6-2 8-2s4 2 6 2" stroke="#EF5350" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "supertrend") {
    return (
      <svg {...common}>
        <path d="M3 14 V7 l5-3 7 4v6" fill="rgba(38,166,154,0.28)" stroke="#26a69a" strokeWidth="1.3" />
        <path d="M3 12h12" stroke="#26a69a" strokeWidth="1.2" strokeDasharray="2 2" />
      </svg>
    );
  }
  if (kind === "psar") {
    return (
      <svg {...common}>
        <circle cx="4" cy="13" r="1.35" fill="#F5C542" />
        <circle cx="7" cy="11" r="1.35" fill="#F5C542" />
        <circle cx="10" cy="8.5" r="1.35" fill="#F5C542" />
        <circle cx="13" cy="6" r="1.35" fill="#F5C542" />
        <circle cx="15.5" cy="4.2" r="1.2" fill="#26C6DA" />
      </svg>
    );
  }
  if (kind === "macd") {
    return (
      <svg {...common}>
        <path d="M3 10h2v4H3zm3-3h2v7H6zm3 1h2v6H9zm3-4h2v10h-2z" fill="#26a69a" />
        <path d="M3 8c3 3 6-4 12 1" stroke="#F5C542" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "rsi") {
    return (
      <svg {...common}>
        <rect x="2.5" y="3" width="13" height="12" rx="1.5" stroke="#8b919c" strokeWidth="1.1" />
        <path d="M4 12c2-6 4 2 6-3 2-4 2 2 4 0" stroke="#ab47bc" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "div") {
    return (
      <svg {...common}>
        <path d="M3 13 L8 8" stroke="#26a69a" strokeWidth="1.5" />
        <path d="M3 7 L8 11" stroke="#ef5350" strokeWidth="1.5" />
        <path d="M10 12 L15 7 L15 10 H18" stroke="#26a69a" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "jerry") {
    return (
      <svg {...common}>
        <path d="M4 12 L9 7 L9 10 H14 V14 H9 L9 17 Z" fill="#26a69a" />
        <path d="M14 6 L14 9 H9 V13 H14 L14 16 L20 11 Z" fill="#ef5350" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2 13 L6 5 L10 12 L16 4" stroke="#d1d4dc" strokeWidth="1.6" strokeLinejoin="miter" strokeLinecap="round" />
    </svg>
  );
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function distPct(price: number, ref: number): string {
  if (!Number.isFinite(price) || !Number.isFinite(ref) || ref === 0) return "—";
  const p = ((price - ref) / ref) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 2 : 4,
  }).format(n);
}

function biasCopy(bias: BtcTradeSignal["bias"]): { title: string; kicker: string } {
  if (bias === "buy") return { title: "COMPRAR", kicker: "Confluencia alcista" };
  if (bias === "sell") return { title: "VENDER", kicker: "Confluencia bajista" };
  return { title: "ESPERAR", kicker: "Sin alineación suficiente" };
}

const KLINE_INTERVAL: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  D: "1d",
};

function rsiWilder(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function swingPivots(values: number[], left = 5, right = 5, kind: "high" | "low"): number[] {
  const idx: number[] = [];
  for (let i = left; i < values.length - right; i++) {
    const v = values[i]!;
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (kind === "low" && values[j]! < v) {
        ok = false;
        break;
      }
      if (kind === "high" && values[j]! > v) {
        ok = false;
        break;
      }
    }
    if (ok) idx.push(i);
  }
  return idx;
}

type DivKind = "bull" | "bear" | "hbull" | "hbear";
type DivMark = { a: number; b: number; ya: number; yb: number; kind: DivKind };

function MomentumDivOverlay({
  binance,
  interval,
  rsiOn,
  macdOn,
}: {
  binance: string;
  interval: string;
  rsiOn: boolean;
  macdOn: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState(0);
  const [rows, setRows] = useState<Array<{ h: number; l: number; c: number }>>([]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setPlotW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      const tf = KLINE_INTERVAL[interval] ?? "1h";
      for (const host of TAPE_HOSTS) {
        try {
          const res = await fetch(`${host}/api/v3/klines?symbol=${binance}&interval=${tf}&limit=500`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw: unknown = await res.json();
          if (!Array.isArray(raw)) throw new Error("klines");
          const next: Array<{ h: number; l: number; c: number }> = [];
          for (const row of raw) {
            if (!Array.isArray(row) || row.length < 5) continue;
            const h = Number(row[2]);
            const l = Number(row[3]);
            const c = Number(row[4]);
            if (![h, l, c].every((x) => Number.isFinite(x))) continue;
            next.push({ h, l, c });
          }
          if (next.length < 40) throw new Error("pocas velas");
          if (!dead) setRows(next);
          return;
        } catch {
          /* siguiente host */
        }
      }
      if (!dead) setRows([]);
    };
    void pull();
    const t = window.setInterval(() => void pull(), 20000);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [binance, interval]);

  const oscN = (rsiOn ? 1 : 0) + (macdOn ? 1 : 0);
  const bottomPct = 18 + oscN * 17;
  const barPx = interval === "D" ? 5.2 : interval === "240" ? 3.4 : interval === "1" ? 3.2 : 2.35;
  const rightBars = 10;
  const slots = Math.max(48, Math.floor(plotW / barPx));
  const visible = Math.min(rows.length, Math.max(30, slots - rightBars));
  const start = Math.max(0, rows.length - visible);
  const highs = rows.map((r) => r.h);
  const lows = rows.map((r) => r.l);
  const closes = rows.map((r) => r.c);
  const rsi = rsiWilder(closes, 14);
  const lowPiv = swingPivots(lows, 5, 5, "low");
  const highPiv = swingPivots(highs, 5, 5, "high");
  const found: DivMark[] = [];
  const pushPair = (pivots: number[], kindHigh: boolean) => {
    for (let k = 1; k < pivots.length; k++) {
      const a = pivots[k - 1]!;
      const b = pivots[k]!;
      const gap = b - a;
      if (gap < 6 || gap > 90) continue;
      const ra = rsi[a];
      const rb = rsi[b];
      if (!Number.isFinite(ra) || !Number.isFinite(rb)) continue;
      if (kindHigh) {
        const pa = highs[a]!;
        const pb = highs[b]!;
        if (pb > pa && rb < ra && (ra > 55 || rb > 52)) found.push({ a, b, ya: pa, yb: pb, kind: "bear" });
        else if (pb < pa && rb > ra && (ra > 55 || rb > 55)) found.push({ a, b, ya: pa, yb: pb, kind: "hbear" });
      } else {
        const pa = lows[a]!;
        const pb = lows[b]!;
        if (pb < pa && rb > ra && (ra < 45 || rb < 48)) found.push({ a, b, ya: pa, yb: pb, kind: "bull" });
        else if (pb > pa && rb < ra && (ra < 45 || rb < 45)) found.push({ a, b, ya: pa, yb: pb, kind: "hbull" });
      }
    }
  };
  pushPair(lowPiv, false);
  pushPair(highPiv, true);

  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = start; i < rows.length; i++) {
    minP = Math.min(minP, rows[i]!.l);
    maxP = Math.max(maxP, rows[i]!.h);
  }
  if (!Number.isFinite(minP) || maxP <= minP) {
    minP = 0;
    maxP = 1;
  }
  const span = maxP - minP;
  const xOf = (i: number) => ((i - start + 0.5) / (visible + rightBars)) * 100;
  const yOf = (px: number) => 7 + (1 - (px - minP) / span) * 80;
  const visMarks = found.filter((d) => d.a >= start && d.b >= start).slice(-8);
  const label: Record<DivKind, string> = {
    bull: "DIV+",
    bear: "DIV−",
    hbull: "H DIV+",
    hbear: "H DIV−",
  };

  return (
    <div
      className="tv-markets-divs"
      ref={boxRef}
      aria-hidden
      style={{
        top: 30,
        left: 54,
        right: 62,
        bottom: `${bottomPct}%`,
      }}
    >
      {plotW > 0 ? (
        <svg className="tv-markets-divs__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {visMarks.map((d) => {
            const x1 = xOf(d.a);
            const x2 = xOf(d.b);
            const y1 = yOf(d.ya);
            const y2 = yOf(d.yb);
            const bull = d.kind === "bull" || d.kind === "hbull";
            return (
              <g key={`${d.kind}-${d.a}-${d.b}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={bull ? "#26a69a" : "#ef5350"}
                  strokeWidth="0.5"
                  strokeDasharray="1.6 1.2"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={x1} cy={y1} r="0.55" fill={bull ? "#26a69a" : "#ef5350"} />
                <circle cx={x2} cy={y2} r="0.55" fill={bull ? "#26a69a" : "#ef5350"} />
              </g>
            );
          })}
        </svg>
      ) : null}
      {plotW > 0
        ? visMarks.map((d) => {
            const bull = d.kind === "bull" || d.kind === "hbull";
            return (
              <span
                key={`lb-${d.kind}-${d.b}`}
                className={`tv-markets-divs__tag${bull ? " is-bull" : " is-bear"}`}
                style={{
                  left: `${xOf(d.b)}%`,
                  top: `${yOf(d.yb)}%`,
                  transform: bull ? "translate(-50%, 18%)" : "translate(-50%, -130%)",
                }}
                title={
                  d.kind === "bull"
                    ? "Divergencia alcista: precio hace mínimo más bajo y RSI más alto"
                    : d.kind === "bear"
                      ? "Divergencia bajista: precio hace máximo más alto y RSI más bajo"
                      : d.kind === "hbull"
                        ? "Divergencia oculta alcista: precio mínimo más alto y RSI más bajo"
                        : "Divergencia oculta bajista: precio máximo más bajo y RSI más alto"
                }
              >
                {label[d.kind]}
              </span>
            );
          })
        : null}
    </div>
  );
}

export function MercadosTradingPage() {
  const { user } = useAuth();
  const canOpen = canUserAccessNavPath(user, PATH);
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]["id"]>("BINANCE:BTCUSDT");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]["id"]>("60");
  const [signal, setSignal] = useState<BtcTradeSignal | null>(null);
  const [signalErr, setSignalErr] = useState("");
  const [signalLoading, setSignalLoading] = useState(true);
  const [tapeQuotes, setTapeQuotes] = useState<Record<string, TapeQuote>>({});
  const [indOpen, setIndOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [studyOn, setStudyOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHART_STUDIES.map((s) => [s.key, s.key !== "jerry"]))
  );
  const dockRef = useRef<HTMLDivElement>(null);
  const pairRef = useRef<HTMLDivElement>(null);
  const active = SYMBOLS.find((s) => s.id === symbol) ?? SYMBOLS[0];

  useEffect(() => {
    if (!indOpen && !pairOpen) return;
    const close = () => {
      setIndOpen(false);
      setPairOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (indOpen && !dockRef.current?.contains(t)) setIndOpen(false);
      if (pairOpen && !pairRef.current?.contains(t)) setPairOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [indOpen, pairOpen]);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const next = await fetchTapeQuotes();
        if (!dead) setTapeQuotes(next);
      } catch {
        /* la faja sigue usable sin cotización */
      }
    };
    void pull();
    const t = window.setInterval(() => void pull(), 5000);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await getBtcTradeSignal({ symbol: active.binance, interval });
        if (dead) return;
        setSignal(r.signal);
        setSignalErr("");
      } catch (e) {
        if (dead) return;
        setSignalErr(e instanceof Error ? e.message : "No se pudo calcular la confluencia.");
      } finally {
        if (!dead) setSignalLoading(false);
      }
    };
    setSignalLoading(true);
    void load();
    const t = window.setInterval(() => void load(), 20000);
    return () => {
      dead = true;
      window.clearInterval(t);
    };
  }, [active.binance, interval]);

  const chartConfig = useMemo(
    () => ({
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      colorTheme: "dark",
      style: "1",
      locale: "es",
      allow_symbol_change: false,
      calendar: false,
      details: false,
      hide_side_toolbar: false,
      hide_top_toolbar: true,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      save_image: true,
      withdateranges: false,
      studies: (() => {
        const enabled = CHART_STUDIES.filter((s) => "spec" in s && s.spec && studyOn[s.key] !== false);
        const rsi = enabled.filter((s) => s.key === "rsi");
        const macd = enabled.filter((s) => s.key === "macd");
        const rest = enabled.filter((s) => s.key !== "rsi" && s.key !== "macd");
        const overlaySlots = Math.max(0, 5 - rsi.length - macd.length);
        return [...rest.slice(0, overlaySlots), ...macd, ...rsi].map((s) => s.spec);
      })(),
      backgroundColor: "#0a100e",
      gridColor: "rgba(61, 186, 154, 0.07)",
      autosize: true,
      support_host: "https://www.tradingview.com",
      overrides: {
        "paneProperties.background": "#0a100e",
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": "rgba(61,186,154,0.08)",
        "paneProperties.horzGridProperties.color": "rgba(61,186,154,0.08)",
        "scalesProperties.textColor": "#c5d0c8",
        "mainSeriesProperties.candleStyle.upColor": "#26a69a",
        "mainSeriesProperties.candleStyle.downColor": "#ef5350",
        "mainSeriesProperties.candleStyle.borderUpColor": "#26a69a",
        "mainSeriesProperties.candleStyle.borderDownColor": "#ef5350",
        "mainSeriesProperties.candleStyle.wickUpColor": "#26a69a",
        "mainSeriesProperties.candleStyle.wickDownColor": "#ef5350",
      },
    }),
    [interval, symbol, studyOn]
  );

  if (!user || !canOpen) {
    return <Navigate to={sgiHome()} replace />;
  }

  const copy = signal ? biasCopy(signal.bias) : { title: "…", kicker: "Calculando confluencia" };

  return (
    <div className="fact-page tv-markets-page">
      {pairOpen || indOpen
        ? createPortal(
            <button
              type="button"
              className="tv-markets-menu-scrim"
              aria-label="Cerrar menú"
              onMouseDown={() => {
                setPairOpen(false);
                setIndOpen(false);
              }}
            />,
            document.body,
          )
        : null}
      {createPortal(
        <div className="tv-markets-tape hrs-card hrs-card--rect sgi-glass-panel">
          <div className="tv-markets-tape__viewport">
            <div className="tv-markets-tape__marquee">
              {[0, 1, 2, 3].map((copyI) => (
                <div
                  key={copyI}
                  className="tv-markets-tape__seq"
                  role={copyI === 0 ? "tablist" : undefined}
                  aria-label={copyI === 0 ? "Monedas" : undefined}
                  aria-hidden={copyI === 0 ? undefined : true}
                >
                  {SYMBOLS.map((s) => {
                    const q = tapeQuotes[s.binance];
                    const up = (q?.changePct ?? 0) >= 0;
                    const chg = q && Number.isFinite(q.changePct) ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "—";
                    return (
                      <button
                        key={`${copyI}-${s.id}`}
                        type="button"
                        role={copyI === 0 ? "tab" : undefined}
                        tabIndex={copyI === 0 ? 0 : -1}
                        aria-selected={copyI === 0 ? s.id === symbol : undefined}
                        className={`tv-markets-tape__item${s.id === symbol ? " is-on" : ""}`}
                        onClick={() => setSymbol(s.id)}
                      >
                        <img className="tv-markets-tape__logo" src={TAPE_LOGO(s.logo)} alt="" width={20} height={20} />
                        <span className="tv-markets-tape__name">{s.name}</span>
                        <span className="tv-markets-tape__px">{formatTapePrice(q?.last ?? 0)}</span>
                        <span className={`tv-markets-tape__chg${up ? " is-up" : " is-down"}`}>{chg}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
      <div className="tv-markets-tape-slot" aria-hidden />
      <div className="container-fluid tv-markets-shell">
        <PageHeader title={`Monitor ${active.label}`} showBackButton backTo="/gestion-administrativa" backText="Volver atrás" />

        <section className="tv-markets-hud" aria-label="Monitor de indicadores">
          <div className="tv-markets-hud__pair">
            <span>{active.label}/{active.quote}</span>
            <strong>{signal ? usd(signal.price) : "—"}</strong>
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema25 ? " is-up" : " is-down"}`}>
            <span>EMA 25</span>
            <strong>{signal ? fmtPx(signal.ema25) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema25) : ""}</em>
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema50 ? " is-up" : " is-down"}`}>
            <span>EMA 50</span>
            <strong>{signal ? fmtPx(signal.ema50) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema50) : ""}</em>
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema200 ? " is-up" : " is-down"}`}>
            <span>EMA 200</span>
            <strong>{signal ? fmtPx(signal.ema200) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema200) : ""}</em>
          </div>
          <div className={`tv-markets-hud__cell${signal?.supertrendDir === 1 ? " is-up" : " is-down"}`}>
            <span>Supertrend</span>
            <strong>{signal ? (signal.supertrendDir === 1 ? "ALCISTA" : "BAJISTA") : "—"}</strong>
            <em>{signal ? fmtPx(signal.supertrend) : ""}</em>
          </div>
          <div className={`tv-markets-hud__cell${signal?.psarDir === 1 ? " is-up" : " is-down"}`}>
            <span>PSAR</span>
            <strong>{signal ? (signal.psarDir === 1 ? "ALCISTA" : "BAJISTA") : "—"}</strong>
            <em>{signal ? fmtPx(signal.psar) : ""}</em>
          </div>
          <div
            className={`tv-markets-hud__cell${
              signal && signal.rsi >= 70 ? " is-down" : signal && signal.rsi <= 30 ? " is-up" : ""
            }`}
          >
            <span>RSI 14</span>
            <strong>{signal ? signal.rsi.toFixed(1) : "—"}</strong>
            <em>
              {signal ? (signal.rsi >= 70 ? "Sobrecompra" : signal.rsi <= 30 ? "Sobreventa" : "Neutro") : ""}
            </em>
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.macdHist >= 0 ? " is-up" : " is-down"}`}>
            <span>MACD hist</span>
            <strong>{signal ? `${signal.macdHist >= 0 ? "+" : ""}${signal.macdHist.toFixed(2)}` : "—"}</strong>
            <em>{signal ? (signal.macdHist >= 0 ? "Momentum +" : "Momentum −") : ""}</em>
          </div>
          <div className="tv-markets-hud__cell">
            <span>ZigZag</span>
            <strong>
              {signal ? (signal.zigzagLast.kind === "low" ? "LOW" : "HIGH") : "—"}
            </strong>
            <em>{signal ? fmtPx(signal.zigzagLast.price) : ""}</em>
          </div>
        </section>

        <div className="tv-markets-desk">
          <div className="tv-markets-chart hrs-card sgi-glass-panel">
            <div className="tv-markets-pairbar" ref={pairRef}>
              <button
                type="button"
                className={`tv-markets-pair${pairOpen ? " is-open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={pairOpen}
                title="Cambiar moneda"
                onClick={() => setPairOpen((v) => !v)}
              >
                <img className="tv-markets-pair__logo" src={TAPE_LOGO(active.logo)} alt="" width={28} height={28} />
                <span className="tv-markets-pair__copy">
                  <strong>
                    {active.label}/{active.quote}
                  </strong>
                  <em>Precio de {active.name}</em>
                </span>
                <svg className="tv-markets-pair__chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden>
                  <path d="M2.2 4.2 L6 8 L9.8 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {pairOpen ? (
                <div className="tv-markets-pair__menu" role="listbox" aria-label="Pares">
                  {SYMBOLS.map((s) => {
                    const q = tapeQuotes[s.binance];
                    const up = (q?.changePct ?? 0) >= 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={s.id === symbol}
                        className={`tv-markets-pair__opt${s.id === symbol ? " is-on" : ""}`}
                        onClick={() => {
                          setSymbol(s.id);
                          setPairOpen(false);
                        }}
                      >
                        <img src={TAPE_LOGO(s.logo)} alt="" width={22} height={22} />
                        <span className="tv-markets-pair__opt-copy">
                          <strong>
                            {s.label}/{s.quote}
                          </strong>
                          <em>{s.name}</em>
                        </span>
                        <span className="tv-markets-pair__opt-px">
                          {formatTapePrice(q?.last ?? 0)}
                          <i className={up ? "is-up" : "is-down"}>
                            {q && Number.isFinite(q.changePct) ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "—"}
                          </i>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="tv-markets-chart__stage">
            <TradingViewEmbed
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
              config={chartConfig}
              className="tv-markets-chart__embed"
            />
            <div className="tv-markets-dock" role="toolbar" aria-label="Temporalidad e indicadores" ref={dockRef}>
              {INTERVALS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`tv-markets-dock__btn${it.id === interval ? " is-on" : ""}`}
                  onClick={() => setInterval(it.id)}
                >
                  {it.label}
                </button>
              ))}
              <span className="tv-markets-dock__sep" aria-hidden />
              <button
                type="button"
                className={`tv-markets-dock__ind${indOpen ? " is-on" : ""}`}
                aria-expanded={indOpen}
                aria-haspopup="menu"
                title="Indicadores"
                onClick={() => setIndOpen((v) => !v)}
              >
                <svg className="tv-markets-dock__ind-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path
                    d="M4 3.5v16.5H21"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7.2 15.2 11 10.6l3.1 3.1L20.2 7.2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {indOpen ? (
                <div className="tv-markets-ind-menu" role="menu" aria-label="Indicadores del gráfico">
                  {CHART_STUDIES.map((s) => {
                    const on = studyOn[s.key] !== false;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        className={`tv-markets-ind-menu__item${on ? " is-on" : ""}`}
                        onClick={() => setStudyOn((prev) => ({ ...prev, [s.key]: !on }))}
                      >
                        <span className="tv-markets-ind-menu__dot" aria-hidden />
                        <span className="tv-markets-ind-menu__ico" aria-hidden>
                          <StudyGlyph kind={s.key} />
                        </span>
                        <span className="tv-markets-ind-menu__copy">
                          <strong>{s.label}</strong>
                          <em>{s.hint}</em>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            </div>
          </div>

          <aside className="tv-markets-rail">
            <div className={`tv-desk-signal tv-desk-signal--${signal?.bias ?? "wait"} hrs-card sgi-glass-panel`}>
              <div className="tv-desk-signal__kicker">{copy.kicker}</div>
              <div className="tv-desk-signal__title">{signalLoading && !signal ? "LEYENDO…" : copy.title}</div>
              <div className="tv-desk-signal__price">{signal ? usd(signal.price) : "—"}</div>
              <div className="tv-desk-signal__conf">
                <div className="tv-desk-signal__conf-bar" style={{ width: `${signal?.confidence ?? 0}%` }} />
              </div>
              <div className="tv-desk-signal__meta">
                {signal
                  ? `${signal.buyVotes} alcistas · ${signal.sellVotes} bajistas · ${signal.waitVotes} neutros · ${signal.confidence}% alineación`
                  : "Esperando velas de Binance"}
              </div>
              <p className="tv-desk-signal__thesis">{signalErr || signal?.thesis || "Calculando…"}</p>
              <p className="tv-desk-signal__action">{signal?.action}</p>
            </div>

            {signal && signal.bias !== "wait" ? (
              <div className={`tv-desk-levels tv-desk-levels--${signal.bias} hrs-card sgi-glass-panel`}>
                <div>
                  <span>{signal.bias === "buy" ? "Largo · entrada" : "Corto · entrada"}</span>
                  <strong>{usd(signal.price)}</strong>
                </div>
                <div>
                  <span>{signal.bias === "buy" ? "Stop debajo" : "Stop arriba"}</span>
                  <strong>{usd(signal.stop)}</strong>
                </div>
                <div>
                  <span>{signal.bias === "buy" ? "T1 arriba" : "T1 abajo"} · {signal.rr1.toFixed(1)}R</span>
                  <strong>{usd(signal.target1)}</strong>
                </div>
                <div>
                  <span>{signal.bias === "buy" ? "T2 arriba" : "T2 abajo"}</span>
                  <strong>{usd(signal.target2)}</strong>
                </div>
              </div>
            ) : signal ? (
              <div className="tv-desk-levels tv-desk-levels--wait hrs-card sgi-glass-panel">
                <div>
                  <span>Precio</span>
                  <strong>{usd(signal.price)}</strong>
                </div>
                <div>
                  <span>Supertrend</span>
                  <strong>{usd(signal.supertrend)}</strong>
                </div>
                <div>
                  <span>EMA 200</span>
                  <strong>{usd(signal.ema200)}</strong>
                </div>
                <div>
                  <span>Plan</span>
                  <strong>Sin setup</strong>
                </div>
              </div>
            ) : null}

            {signal ? (
              <div className="tv-desk-ranges hrs-card sgi-glass-panel">
                <h2>Rangos</h2>
                <div className="tv-desk-range">
                  <span>Rango del día</span>
                  <strong>
                    {usd(signal.rangeDayLow ?? NaN)}
                    <em>→</em>
                    {usd(signal.rangeDayHigh ?? NaN)}
                  </strong>
                </div>
                <div className="tv-desk-range">
                  <span>Rango 52 semanas</span>
                  <strong>
                    {usd(signal.range52Low ?? NaN)}
                    <em>→</em>
                    {usd(signal.range52High ?? NaN)}
                  </strong>
                </div>
              </div>
            ) : null}

            <div className="tv-desk-checks hrs-card sgi-glass-panel">
              <h2>Checklist de confluencia</h2>
              <ul>
                {(signal?.checks ?? []).map((c) => (
                  <li key={c.id} className={`tv-desk-check tv-desk-check--${c.bias}`}>
                    <span className="tv-desk-check__tag">
                      {c.bias === "buy" ? "ALCISTA" : c.bias === "sell" ? "BAJISTA" : "NEUTRO"}
                    </span>
                    <div>
                      <strong>{c.label}</strong>
                      <em>{c.detail}</em>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
