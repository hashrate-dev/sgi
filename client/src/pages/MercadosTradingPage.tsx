import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Navigate } from "react-router-dom";
import { MercadosNativeChart, type ChartDrawTool } from "../components/MercadosNativeChart";
import { DRAW_COLORS } from "../lib/mercadosDrawings";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { getBtcTradeSignal, type BtcTradeCheck, type BtcTradeSignal } from "../lib/api";
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

type TapeQuote = {
  last: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  quoteVolume: number;
  vwap: number;
  trades: number;
  bid: number;
  ask: number;
};

function formatTapePrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function compactQty(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (n >= 100) return n.toFixed(1);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function mergeTapeQuote(prev: TapeQuote | undefined, next: TapeQuote): TapeQuote {
  const out: TapeQuote = prev
    ? { ...prev }
    : {
        last: NaN,
        change: NaN,
        changePct: NaN,
        high: NaN,
        low: NaN,
        open: NaN,
        volume: NaN,
        quoteVolume: NaN,
        vwap: NaN,
        trades: NaN,
        bid: NaN,
        ask: NaN,
      };
  (Object.keys(next) as (keyof TapeQuote)[]).forEach((k) => {
    const v = next[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  });
  return out;
}

function parseTickerRow(o: Record<string, unknown>): TapeQuote | null {
  const last = Number(o.lastPrice ?? o.c);
  if (!Number.isFinite(last) || last <= 0) return null;
  return {
    last,
    change: Number(o.priceChange ?? o.p),
    changePct: Number(o.priceChangePercent ?? o.P),
    high: Number(o.highPrice ?? o.h),
    low: Number(o.lowPrice ?? o.l),
    open: Number(o.openPrice ?? o.o),
    volume: Number(o.volume ?? o.v),
    quoteVolume: Number(o.quoteVolume ?? o.q),
    vwap: Number(o.weightedAvgPrice ?? o.w),
    trades: Number(o.count ?? o.n),
    bid: Number(o.bidPrice ?? o.b),
    ask: Number(o.askPrice ?? o.a),
  };
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
        const o = row as Record<string, unknown>;
        if (typeof o.symbol !== "string") continue;
        const q = parseTickerRow(o);
        if (q) out[o.symbol] = q;
      }
      return out;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Sin precios");
}

const INTERVALS = [
  { id: "LIVE", label: "LIVE" },
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "30", label: "30m" },
  { id: "60", label: "1h" },
  { id: "240", label: "4h" },
  { id: "D", label: "1D" },
] as const;

const CHART_STUDIES = [
  { key: "ema25", label: "EMA 25", hint: "Media rápida", group: "Tendencia" },
  { key: "ema50", label: "EMA 50", hint: "Media intermedia", group: "Tendencia" },
  { key: "ema200", label: "EMA 200", hint: "Régimen / tendencia", group: "Tendencia" },
  { key: "supertrend", label: "Supertrend", hint: "Sesgo y stop", group: "Tendencia" },
  { key: "psar", label: "Parabolic SAR", hint: "Puntos 0.02 / 0.02 / 0.2", group: "Tendencia" },
  { key: "zigzag", label: "ZigZag", hint: "Swings high/low", group: "Tendencia" },
  { key: "ichimoku", label: "Nube de Ichimoku", hint: "Tenkan 9 · Kijun 26 · Senkou 52", group: "Tendencia" },
  { key: "bollinger", label: "Bandas de Bollinger", hint: "SMA 20 · 2σ", group: "Volumen" },
  { key: "macd", label: "MACD", hint: "Histograma 12/26/9", group: "Momentum" },
  { key: "rsi", label: "RSI", hint: "Sobrecompra / venta", group: "Momentum" },
  { key: "jerry", label: "Jerry Buy Sell", hint: "EARLY · BUY · SELL en cada vela", group: "Señales" },
  { key: "heatmap", label: "Mapa de calor", hint: "Volumen en cuerpo/mechas de cada vela", group: "Volumen" },
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
  if (kind === "ichimoku") {
    return (
      <svg {...common}>
        <path d="M2 12 L6 9 L10 11 L16 6 L16 14 L2 14 Z" fill="rgba(38,166,154,0.35)" />
        <path d="M2 8 L7 11 L11 7 L16 10 L16 14 L2 14 Z" fill="rgba(239,83,80,0.28)" />
        <path d="M2 10c4-4 6 2 8 0s4-4 6-1" stroke="#4FC3F7" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "bollinger") {
    return (
      <svg {...common}>
        <path d="M2 5c4 2 6-2 8 0s4 3 6 0" stroke="#5b9cf6" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M2 9c4 1.5 6-1 8 0s4 2 6 0" stroke="#5b9cf6" strokeWidth="1.2" strokeDasharray="2 2" strokeLinecap="round" />
        <path d="M2 13c4 2 6-2 8 0s4 3 6 0" stroke="#5b9cf6" strokeWidth="1.3" strokeLinecap="round" />
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
  if (kind === "jerry") {
    return (
      <svg {...common}>
        <path d="M4 12 L9 7 L9 10 H14 V14 H9 L9 17 Z" fill="#26a69a" />
        <path d="M14 6 L14 9 H9 V13 H14 L14 16 L20 11 Z" fill="#ef5350" />
      </svg>
    );
  }
  if (kind === "heatmap") {
    return (
      <svg {...common}>
        <rect x="2" y="10" width="4" height="6" rx="0.6" fill="#0ea5e9" />
        <rect x="7" y="6" width="4" height="10" rx="0.6" fill="#eab308" />
        <rect x="12" y="3" width="4" height="13" rx="0.6" fill="#ef4444" />
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

function rangePct(price: number, lo: number, hi: number): number {
  if (![price, lo, hi].every((n) => Number.isFinite(n)) || hi <= lo) return 50;
  return Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100));
}

function BiasGlyph({ bias, size = 22 }: { bias?: "buy" | "sell" | "wait"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  if (bias === "buy") {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.16" />
        <path d="M12 5.5 L19 14.2 H15.1 V18.5 H8.9 V14.2 H5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (bias === "sell") {
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.16" />
        <path d="M12 18.5 L19 9.8 H15.1 V5.5 H8.9 V9.8 H5 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.16" />
      <rect x="8" y="7.2" width="2.6" height="9.6" rx="0.7" fill="currentColor" />
      <rect x="13.4" y="7.2" width="2.6" height="9.6" rx="0.7" fill="currentColor" />
    </svg>
  );
}

function HudLab({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="tv-markets-hud__lab">{children}</span>
      <span className="tv-markets-hud__ico" aria-hidden>
        {icon}
      </span>
    </>
  );
}

function HudTip({ check, title, detail }: { check?: BtcTradeCheck; title?: string; detail?: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<CSSProperties>({});
  const label = check?.label ?? title;
  const body = check?.detail ?? detail;
  const bias = check?.bias ?? "wait";
  const tag = bias === "buy" ? "ALCISTA" : bias === "sell" ? "BAJISTA" : "NEUTRO";
  const tipId = check?.id ?? title ?? "hud";

  useLayoutEffect(() => {
    const cell = anchorRef.current?.parentElement;
    if (!cell) return;
    cell.classList.add("is-tip");
    cell.style.cursor = "pointer";
    const place = () => {
      const r = cell.getBoundingClientRect();
      const width = Math.min(280, Math.max(200, window.innerWidth - 16));
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setBox({
        position: "fixed",
        top: r.bottom + 8,
        left,
        width,
        zIndex: 5000,
      });
    };
    const onCellClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      place();
      setOpen((was) => {
        const next = !was;
        if (next) window.dispatchEvent(new CustomEvent("tv-hud-tip-open", { detail: tipId }));
        return next;
      });
    };
    const onPeerOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id !== tipId) setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (cell.contains(t)) return;
      if (tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    cell.addEventListener("click", onCellClick);
    window.addEventListener("tv-hud-tip-open", onPeerOpen);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cell.classList.remove("is-tip");
      cell.removeEventListener("click", onCellClick);
      window.removeEventListener("tv-hud-tip-open", onPeerOpen);
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [tipId]);

  if (!label && !body) return <span ref={anchorRef} className="tv-markets-hud__tip-anchor" aria-hidden />;

  return (
    <>
      <span ref={anchorRef} className="tv-markets-hud__tip-anchor" aria-hidden />
      {open
        ? createPortal(
            <div ref={tipRef} className={`tv-markets-hud__tip is-${bias} is-open`} role="dialog" style={box}>
              {check ? <span className="tv-markets-hud__tip-tag">{tag}</span> : null}
              {label ? <strong>{label}</strong> : null}
              {body ? <em>{body}</em> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function BiasClock({
  bias,
  confidence,
  buyVotes,
  sellVotes,
}: {
  bias?: "buy" | "sell" | "wait";
  confidence?: number;
  buyVotes?: number;
  sellVotes?: number;
}) {
  const conf = Math.max(0, Math.min(100, confidence ?? 0));
  let pct = 50;
  if (bias === "buy") pct = 50 + (20 + conf * 0.3);
  else if (bias === "sell") pct = 50 - (20 + conf * 0.3);
  else {
    const delta = (buyVotes ?? 0) - (sellVotes ?? 0);
    pct = 50 + Math.max(-12, Math.min(12, delta * 3));
  }
  pct = Math.max(6, Math.min(94, pct));
  const angle = -90 + (pct / 100) * 180;
  const title = bias === "buy" ? "COMPRAR" : bias === "sell" ? "VENDER" : "ESPERAR";
  return (
    <div className={`tv-desk-clock tv-desk-clock--${bias ?? "wait"} hrs-card sgi-glass-panel`} aria-label={`Señal: ${title}`}>
      <h2>Señal</h2>
      <div className="tv-desk-clock__face" aria-hidden>
        <svg viewBox="0 0 200 118">
          <defs>
            <linearGradient id="tv-clock-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ef5350" />
              <stop offset="50%" stopColor="#f5c542" />
              <stop offset="100%" stopColor="#26a69a" />
            </linearGradient>
          </defs>
          <path
            d="M18 108 A 82 82 0 0 1 182 108"
            fill="none"
            stroke="url(#tv-clock-arc)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <g transform={`rotate(${angle} 100 108)`}>
            <line x1="100" y1="108" x2="100" y2="38" stroke="#e8eef5" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="100" cy="108" r="6" fill="#e8eef5" />
          </g>
        </svg>
        <span className="tv-desk-clock__sell">Vender</span>
        <span className="tv-desk-clock__wait">Esperar</span>
        <span className="tv-desk-clock__buy">Comprar</span>
      </div>
      <strong>{title}</strong>
    </div>
  );
}

function biasCopy(bias: BtcTradeSignal["bias"]): { title: string; kicker: string } {
  if (bias === "buy") return { title: "COMPRAR", kicker: "Confluencia alcista" };
  if (bias === "sell") return { title: "VENDER", kicker: "Confluencia bajista" };
  return { title: "ESPERAR", kicker: "Sin alineación suficiente" };
}

const DRAW_TOOLS: Array<{ id: ChartDrawTool; title: string }> = [
  { id: "cursor", title: "Cursor" },
  { id: "trend", title: "Línea de tendencia" },
  { id: "hline", title: "Línea horizontal" },
  { id: "vline", title: "Línea vertical" },
  { id: "ray", title: "Rayo" },
  { id: "rect", title: "Rectángulo" },
  { id: "fib", title: "Fibonacci" },
  { id: "ruler", title: "Regla (% subida / bajada)" },
  { id: "pencil", title: "Lápiz" },
  { id: "eraser", title: "Borrar dibujo (clic sobre la herramienta)" },
];

function DrawGlyph({ kind }: { kind: ChartDrawTool }) {
  const p = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", "aria-hidden": true as const };
  if (kind === "cursor") {
    return (
      <svg {...p}>
        <path d="M4 3 L4 14 L7.2 11.2 L9.2 16 L11 15.2 L9 10.4 L13.5 10.4 Z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "trend") {
    return (
      <svg {...p}>
        <path d="M3 14 L15 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="3" cy="14" r="1.4" fill="currentColor" />
        <circle cx="15" cy="4" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "hline") {
    return (
      <svg {...p}>
        <path d="M2 9 H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "vline") {
    return (
      <svg {...p}>
        <path d="M9 2 V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "ray") {
    return (
      <svg {...p}>
        <path d="M3 13 L16 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="3" cy="13" r="1.4" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "rect") {
    return (
      <svg {...p}>
        <rect x="3.5" y="4.5" width="11" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (kind === "fib") {
    return (
      <svg {...p}>
        <path d="M3 4 H15 M3 7.2 H15 M3 10.5 H15 M3 14 H15" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (kind === "pencil") {
    return (
      <svg {...p}>
        <path d="M11.5 3.2 L14.8 6.5 L7 14.3 H3.7 V11 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "ruler") {
    return (
      <svg {...p}>
        <rect x="3.2" y="4.4" width="11.6" height="9.2" rx="1.2" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.2 1.6" />
        <path d="M6.2 13.6 L11.8 4.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M4.8 7.4 h2.4 M4.8 10.6 h3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...p}>
      <path d="M5 5 L13 13 M13 5 L5 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
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
    Object.fromEntries(CHART_STUDIES.map((s) => [s.key, true]))
  );
  const [drawTool, setDrawTool] = useState<ChartDrawTool>("cursor");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]!);
  const [drawPulse, setDrawPulse] = useState<{ n: number; op: "undo" | "clear" }>({ n: 0, op: "undo" });
  const dockRef = useRef<HTMLDivElement>(null);
  const pairRef = useRef<HTMLDivElement>(null);
  const pairBtnRef = useRef<HTMLButtonElement>(null);
  const pairMenuRef = useRef<HTMLDivElement>(null);
  const [pairMenuBox, setPairMenuBox] = useState<CSSProperties>({});
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
      if (pairOpen && !pairRef.current?.contains(t) && !pairMenuRef.current?.contains(t)) setPairOpen(false);
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

  useLayoutEffect(() => {
    if (!pairOpen) return;
    const place = () => {
      const r = pairBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(400, Math.max(320, window.innerWidth - 16));
      let left = r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPairMenuBox({
        position: "fixed",
        top: r.bottom + 8,
        left,
        width,
        zIndex: 6200,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [pairOpen]);

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
    const stream = `${active.binance.toLowerCase()}@ticker`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    ws.onmessage = (ev) => {
      try {
        const raw: unknown = JSON.parse(String(ev.data));
        if (!raw || typeof raw !== "object") return;
        const q = parseTickerRow(raw as Record<string, unknown>);
        if (!q) return;
        setTapeQuotes((prev) => ({
          ...prev,
          [active.binance]: mergeTapeQuote(prev[active.binance], q),
        }));
      } catch {
        /* ticker WS opcional */
      }
    };
    return () => {
      ws.close();
    };
  }, [active.binance]);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await getBtcTradeSignal({
          symbol: active.binance,
          interval: interval === "LIVE" ? "1s" : interval,
        });
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

  if (!user || !canOpen) {
    return <Navigate to={sgiHome()} replace />;
  }

  const copy = signal ? biasCopy(signal.bias) : { title: "…", kicker: "Calculando confluencia" };
  const studiesOnCount = CHART_STUDIES.filter((s) => studyOn[s.key] !== false).length;
  const ck = (id: string) => signal?.checks?.find((c) => c.id === id);

  return (
    <div className="fact-page tv-markets-page">
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
            <HudLab
              icon={
                <svg width="28" height="28" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <circle cx="9" cy="9" r="6.5" stroke="#26a69a" strokeWidth="1.5" />
                  <path d="M9 5.2 V9 L11.6 11" stroke="#26a69a" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            >
              {active.label}/{active.quote}
            </HudLab>
            <strong>{signal ? usd(signal.price) : "—"}</strong>
            <HudTip title={copy.kicker} detail={signal?.guide ?? signal?.thesis} />
          </div>
          <div className={`tv-markets-hud__cell tv-markets-hud__cell--action is-${signal?.bias ?? "wait"}`}>
            <HudLab icon={<BiasGlyph bias={signal?.bias ?? "wait"} size={22} />}>Qué hacer</HudLab>
            <strong>
              {signal ? (signal.bias === "buy" ? "COMPRAR" : signal.bias === "sell" ? "VENDER" : "ESPERAR") : "—"}
            </strong>
            <em>{signal ? `${signal.buyVotes} vs ${signal.sellVotes} · ${signal.confidence}%` : ""}</em>
            <HudTip
              check={
                signal
                  ? {
                      id: "guide",
                      label: copy.title,
                      bias: signal.bias,
                      detail: [signal.thesis, ck("jerry")?.detail].filter(Boolean).join(" · "),
                    }
                  : undefined
              }
            />
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema25 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="ema25" />}>EMA 25</HudLab>
            <strong>{signal ? fmtPx(signal.ema25) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema25) : ""}</em>
            <HudTip check={ck("ema-slope")} />
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema50 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="ema50" />}>EMA 50</HudLab>
            <strong>{signal ? fmtPx(signal.ema50) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema50) : ""}</em>
            <HudTip check={ck("ema-cross")} />
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.price >= signal.ema200 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="ema200" />}>EMA 200</HudLab>
            <strong>{signal ? fmtPx(signal.ema200) : "—"}</strong>
            <em>{signal ? distPct(signal.price, signal.ema200) : ""}</em>
            <HudTip check={ck("ema200")} />
          </div>
          <div className={`tv-markets-hud__cell${signal?.supertrendDir === 1 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="supertrend" />}>Supertrend</HudLab>
            <strong>{signal ? (signal.supertrendDir === 1 ? "ALCISTA" : "BAJISTA") : "—"}</strong>
            <em>{signal ? fmtPx(signal.supertrend) : ""}</em>
            <HudTip check={ck("supertrend")} />
          </div>
          <div className={`tv-markets-hud__cell${signal?.psarDir === 1 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="psar" />}>PSAR</HudLab>
            <strong>{signal ? (signal.psarDir === 1 ? "ALCISTA" : "BAJISTA") : "—"}</strong>
            <em>{signal ? fmtPx(signal.psar) : ""}</em>
            <HudTip check={ck("psar")} />
          </div>
          <div
            className={`tv-markets-hud__cell${
              signal && signal.rsi >= 70 ? " is-down" : signal && signal.rsi <= 30 ? " is-up" : ""
            }`}
          >
            <HudLab icon={<StudyGlyph kind="rsi" />}>RSI 14</HudLab>
            <strong>{signal ? signal.rsi.toFixed(1) : "—"}</strong>
            <em>
              {signal ? (signal.rsi >= 70 ? "Sobrecompra" : signal.rsi <= 30 ? "Sobreventa" : "Neutro") : ""}
            </em>
            <HudTip check={ck("rsi")} />
          </div>
          <div className={`tv-markets-hud__cell${signal && signal.macdHist >= 0 ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="macd" />}>MACD 12/26/9</HudLab>
            <strong>
              {signal
                ? `${signal.macdHist >= 0 ? "+" : ""}${signal.macdHist.toFixed(2)}`
                : "—"}
            </strong>
            <em className="tv-markets-hud__stack">
              {signal ? (
                <>
                  <span>MACD {signal.macd.toFixed(2)}</span>
                  <span>Sig {signal.macdSignal.toFixed(2)}</span>
                </>
              ) : null}
            </em>
            <HudTip check={ck("macd")} />
          </div>
          <div className={`tv-markets-hud__cell${signal?.zigzagLast.kind === "low" ? " is-up" : " is-down"}`}>
            <HudLab icon={<StudyGlyph kind="zigzag" />}>ZigZag</HudLab>
            <strong>
              {signal ? (signal.zigzagLast.kind === "low" ? "LOW" : "HIGH") : "—"}
            </strong>
            <em>{signal ? fmtPx(signal.zigzagLast.price) : ""}</em>
            <HudTip check={ck("zigzag")} />
          </div>
          <div
            className={`tv-markets-hud__cell${
              signal?.ichiCloud === "above" ? " is-up" : signal?.ichiCloud === "below" ? " is-down" : ""
            }`}
          >
            <HudLab icon={<StudyGlyph kind="ichimoku" />}>Ichimoku</HudLab>
            <strong>
              {signal?.ichiCloud === "above" ? "SOBRE NUBE" : signal?.ichiCloud === "below" ? "BAJO NUBE" : signal ? "EN NUBE" : "—"}
            </strong>
            <em className="tv-markets-hud__stack">
              {signal && Number.isFinite(signal.ichiTenkan ?? NaN) ? (
                <>
                  <span>T {fmtPx(signal.ichiTenkan!)}</span>
                  <span>K {fmtPx(signal.ichiKijun ?? NaN)}</span>
                </>
              ) : null}
            </em>
            <HudTip check={ck("ichimoku")} />
          </div>
          <div
            className={`tv-markets-hud__cell${
              signal && (signal.bbPctB ?? 0.5) >= 0.5 ? " is-up" : " is-down"
            }`}
          >
            <HudLab icon={<StudyGlyph kind="bollinger" />}>Bollinger</HudLab>
            <strong>{signal && Number.isFinite(signal.bbPctB ?? NaN) ? `%B ${(signal.bbPctB! * 100).toFixed(0)}` : "—"}</strong>
            <em>{signal && Number.isFinite(signal.bbMid ?? NaN) ? `Media ${fmtPx(signal.bbMid!)}` : ""}</em>
            <HudTip check={ck("bollinger")} />
          </div>
          <div className={`tv-markets-hud__cell${signal && (signal.volRatio ?? 1) >= 1.15 ? " is-up" : ""}`}>
            <HudLab icon={<StudyGlyph kind="heatmap" />}>Volumen</HudLab>
            <strong>{signal && Number.isFinite(signal.volRatio ?? NaN) ? `${signal.volRatio!.toFixed(2)}×` : "—"}</strong>
            <em>{signal && (signal.volRatio ?? 0) >= 1.15 ? "Confirma" : signal ? "Flojo" : ""}</em>
            <HudTip check={ck("volume")} />
          </div>
        </section>

        <div className="tv-markets-desk">
          <div className="tv-markets-chart hrs-card sgi-glass-panel">
            <div className="tv-markets-pairbar" ref={pairRef}>
              <button
                type="button"
                ref={pairBtnRef}
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
              {(() => {
                const q = tapeQuotes[active.binance];
                const up = (q?.changePct ?? 0) >= 0;
                const range = q && q.high > q.low ? q.high - q.low : 0;
                const pos = q && range > 0 ? Math.max(0, Math.min(1, (q.last - q.low) / range)) : 0.5;
                const ampPct = q && q.low > 0 ? ((q.high - q.low) / q.low) * 100 : NaN;
                const spread = q && q.ask > 0 && q.bid > 0 ? q.ask - q.bid : NaN;
                const mid = q && q.ask > 0 && q.bid > 0 ? (q.ask + q.bid) / 2 : NaN;
                const spreadBps =
                  Number.isFinite(spread) && Number.isFinite(mid) && mid > 0 ? (spread / mid) * 10000 : NaN;
                return (
                  <div className="tv-markets-pairstats" aria-label="Datos de mercado 24h">
                    <div className={`tv-markets-pairstats__cell tv-markets-pairstats__cell--px${up ? " is-up" : " is-down"}`}>
                      <span>Último</span>
                      <strong>{formatTapePrice(q?.last ?? 0)}</strong>
                      <em>
                        {q && Number.isFinite(q.changePct)
                          ? `${up ? "+" : ""}${formatTapePrice(Math.abs(q.change))}  ${up ? "+" : ""}${q.changePct.toFixed(2)}%`
                          : "—"}
                      </em>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>24h Máx</span>
                      <strong>{formatTapePrice(q?.high ?? 0)}</strong>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>24h Mín</span>
                      <strong>{formatTapePrice(q?.low ?? 0)}</strong>
                    </div>
                    <div className="tv-markets-pairstats__cell tv-markets-pairstats__cell--range">
                      <span>Rango 24h {Number.isFinite(ampPct) ? `${ampPct.toFixed(2)}%` : ""}</span>
                      <div className="tv-markets-pairstats__track" title="Posición del precio en el rango 24h">
                        <i style={{ left: `${pos * 100}%` }} />
                      </div>
                      <em>
                        {formatTapePrice(q?.low ?? 0)} → {formatTapePrice(q?.high ?? 0)}
                      </em>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>Vol 24h ({active.label})</span>
                      <strong>{compactQty(q?.volume ?? NaN)}</strong>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>Vol 24h ({active.quote})</span>
                      <strong>{compactQty(q?.quoteVolume ?? NaN)}</strong>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>VWAP 24h</span>
                      <strong>{formatTapePrice(q?.vwap ?? 0)}</strong>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>Bid / Ask</span>
                      <strong>
                        {formatTapePrice(q?.bid ?? 0)} <span className="tv-markets-pairstats__sep">/</span>{" "}
                        {formatTapePrice(q?.ask ?? 0)}
                      </strong>
                      <em>{Number.isFinite(spreadBps) ? `Spread ${spreadBps.toFixed(2)} bps` : "—"}</em>
                    </div>
                    <div className="tv-markets-pairstats__cell">
                      <span>Trades 24h</span>
                      <strong>{compactQty(q?.trades ?? NaN)}</strong>
                    </div>
                  </div>
                );
              })()}
              {pairOpen
                ? createPortal(
                    <div
                      ref={pairMenuRef}
                      className="tv-markets-pair__menu"
                      role="listbox"
                      aria-label="Pares"
                      style={pairMenuBox}
                    >
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
                            <span className="tv-markets-pair__opt-logo" aria-hidden>
                              <img src={TAPE_LOGO(s.logo)} alt="" width={32} height={32} />
                            </span>
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
                    </div>,
                    document.body,
                  )
                : null}
            </div>
            <div className="tv-markets-chart__stage">
            <MercadosNativeChart
              binance={active.binance}
              interval={interval}
              studyOn={studyOn}
              drawTool={drawTool}
              drawColor={drawColor}
              drawPulse={drawPulse}
            />
            {pairOpen || indOpen ? (
              <button
                type="button"
                className="tv-markets-menu-scrim"
                aria-label="Cerrar menú"
                onMouseDown={() => {
                  setPairOpen(false);
                  setIndOpen(false);
                }}
              />
            ) : null}
            <div className="tv-markets-dock" role="toolbar" aria-label="Temporalidad e indicadores" ref={dockRef}>
              {INTERVALS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className={`tv-markets-dock__btn${it.id === interval ? " is-on" : ""}${it.id === "LIVE" ? " is-live" : ""}`}
                  onClick={() => setInterval(it.id)}
                >
                  {it.id === "LIVE" ? (
                    <>
                      <span className="tv-markets-dock__live-dot" aria-hidden />
                      LIVE
                    </>
                  ) : (
                    it.label
                  )}
                </button>
              ))}
              <span className="tv-markets-dock__sep" aria-hidden />
              <div className="tv-markets-dock__ind-wrap">
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
                <div
                  className="tv-markets-ind-menu"
                  role="menu"
                  aria-label="Indicadores del gráfico"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="tv-markets-ind-menu__head">
                    Indicadores Activos: {studiesOnCount}/{CHART_STUDIES.length}
                  </div>
                  {CHART_STUDIES.map((s) => {
                    const on = studyOn[s.key] !== false;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        className={`tv-markets-ind-menu__item${on ? " is-on" : ""}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStudyOn((prev) => ({ ...prev, [s.key]: prev[s.key] === false }));
                        }}
                      >
                        <span className="tv-markets-ind-menu__ico" aria-hidden>
                          <StudyGlyph kind={s.key} />
                        </span>
                        <span className="tv-markets-ind-menu__copy">
                          <strong>{s.label}</strong>
                          <em>{s.hint}</em>
                        </span>
                        <span className={`tv-markets-ind-menu__status${on ? " is-on" : ""}`} aria-hidden />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              </div>
              <span className="tv-markets-dock__sep" aria-hidden />
              {DRAW_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`tv-markets-dock__tool${drawTool === tool.id ? " is-on" : ""}`}
                  title={tool.title}
                  aria-label={tool.title}
                  aria-pressed={drawTool === tool.id}
                  onClick={() => setDrawTool(tool.id)}
                >
                  <DrawGlyph kind={tool.id} />
                </button>
              ))}
              <div className="tv-markets-dock__colors" role="group" aria-label="Color de dibujo">
                {DRAW_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`tv-markets-dock__swatch${drawColor.toLowerCase() === c.toLowerCase() ? " is-on" : ""}`}
                    style={{ background: c }}
                    title={`Color ${c}`}
                    aria-label={`Color ${c}`}
                    aria-pressed={drawColor.toLowerCase() === c.toLowerCase()}
                    onClick={() => setDrawColor(c)}
                  />
                ))}
                <label className="tv-markets-dock__swatch-custom" title="Color personalizado">
                  <input
                    type="color"
                    value={drawColor}
                    aria-label="Color personalizado"
                    onChange={(e) => setDrawColor(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="tv-markets-dock__tool"
                title="Deshacer / eliminar dibujo seleccionado"
                aria-label="Deshacer / eliminar dibujo seleccionado"
                onClick={() => setDrawPulse((s) => ({ n: s.n + 1, op: "undo" }))}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M5 7 H12.2 A3.2 3.2 0 0 1 12.2 13.4 H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M5 7 L7.6 4.6 M5 7 L7.6 9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className="tv-markets-dock__tool"
                title="Borrar todos los dibujos"
                aria-label="Borrar todos los dibujos"
                onClick={() => setDrawPulse((s) => ({ n: s.n + 1, op: "clear" }))}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M4 5.5 H14 M7 5.5 V4.2 H11 V5.5 M6 5.5 L6.6 14 H11.4 L12 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            </div>
          </div>

          <aside className="tv-markets-rail">
            <div className={`tv-desk-signal tv-desk-signal--${signal?.bias ?? "wait"} hrs-card sgi-glass-panel`}>
              <div className="tv-desk-signal__lead">
                <div className="tv-desk-signal__call">
                  <span className="tv-desk-signal__badge">{copy.kicker}</span>
                  <div className="tv-desk-signal__title">{signalLoading && !signal ? "LEYENDO…" : copy.title}</div>
                  <div className="tv-desk-signal__price">{signal ? usd(signal.price) : "—"}</div>
                </div>
                <span className="tv-desk-signal__icon" title={copy.title} aria-hidden>
                  <BiasGlyph bias={signal?.bias ?? "wait"} size={26} />
                </span>
              </div>

              {signalErr ? (
                <p className="tv-desk-signal__hint">{signalErr}</p>
              ) : signal ? (
                <>
                  {signal.bias !== "wait" ? (
                    <div className="tv-desk-signal__facts">
                      <div>
                        <span>Stop</span>
                        <strong>{usd(signal.stop)}</strong>
                      </div>
                      <div>
                        <span>Riesgo 1R</span>
                        <strong>
                          {usd(signal.riskUsd)}
                          {signal.price > 0 ? <em>{((signal.riskUsd / signal.price) * 100).toFixed(1)}%</em> : null}
                        </strong>
                      </div>
                      <div>
                        <span>Invalida</span>
                        <strong>{usd(signal.invalidation)}</strong>
                      </div>
                    </div>
                  ) : null}
                  <p className="tv-desk-signal__hint">
                    {(signal.guide ?? signal.thesis ?? "").replace(/^(COMPRAR|VENDER)\.\s*/i, "") || "Calculando…"}
                  </p>
                </>
              ) : (
                <p className="tv-desk-signal__hint">Calculando…</p>
              )}

              <div className="tv-desk-signal__conf-wrap">
                <div className="tv-desk-signal__conf-row">
                  <span>Alineación</span>
                  <strong>{signal ? `${signal.confidence}%` : "—"}</strong>
                  <em>{signal ? `${signal.buyVotes}↑ ${signal.sellVotes}↓ ${signal.waitVotes}○` : ""}</em>
                </div>
                <div className="tv-desk-signal__conf">
                  <div className="tv-desk-signal__conf-bar" style={{ width: `${signal?.confidence ?? 0}%` }} />
                </div>
              </div>
            </div>

            {signal && signal.bias !== "wait" ? (
              <div className={`tv-desk-levels tv-desk-levels--${signal.bias} hrs-card sgi-glass-panel`}>
                <div className="tv-desk-level">
                  <span>{signal.bias === "buy" ? "Largo · entrada" : "Corto · entrada"}</span>
                  <strong>{usd(signal.price)}</strong>
                </div>
                <div className="tv-desk-level">
                  <span>{signal.bias === "buy" ? "Stop debajo" : "Stop arriba"}</span>
                  <strong>{usd(signal.stop)}</strong>
                  <em>{signal.riskUsd ? `Riesgo ${usd(signal.riskUsd)}` : ""}</em>
                </div>
                <div className="tv-desk-level">
                  <span>{signal.bias === "buy" ? "T1 arriba" : "T1 abajo"}</span>
                  <strong>{usd(signal.target1)}</strong>
                  <em>{signal.rr1.toFixed(1)}R</em>
                </div>
                <div className="tv-desk-level">
                  <span>{signal.bias === "buy" ? "T2 arriba" : "T2 abajo"}</span>
                  <strong>{usd(signal.target2)}</strong>
                </div>
              </div>
            ) : signal ? (
              <div className="tv-desk-levels tv-desk-levels--wait hrs-card sgi-glass-panel">
                <div className="tv-desk-level">
                  <span>Precio</span>
                  <strong>{usd(signal.price)}</strong>
                </div>
                <div className="tv-desk-level">
                  <span>Supertrend</span>
                  <strong>{usd(signal.supertrend)}</strong>
                </div>
                <div className="tv-desk-level">
                  <span>EMA 200</span>
                  <strong>{usd(signal.ema200)}</strong>
                </div>
                <div className="tv-desk-level">
                  <span>Plan</span>
                  <strong>Esperar</strong>
                  <em>{signal.guide ?? "Sin setup"}</em>
                </div>
              </div>
            ) : null}

            {signal ? (
              <div className="tv-desk-ranges hrs-card sgi-glass-panel">
                <h2>Rangos</h2>
                <div className="tv-desk-range">
                  <div className="tv-desk-range__head">
                    <span>Rango del día</span>
                    <strong>
                      {usd(signal.rangeDayLow ?? NaN)}
                      <em>→</em>
                      {usd(signal.rangeDayHigh ?? NaN)}
                    </strong>
                  </div>
                  <div className="tv-desk-range__track" aria-hidden>
                    <i
                      className="tv-desk-range__dot"
                      style={{ left: `${rangePct(signal.price, signal.rangeDayLow ?? NaN, signal.rangeDayHigh ?? NaN)}%` }}
                    />
                  </div>
                </div>
                <div className="tv-desk-range">
                  <div className="tv-desk-range__head">
                    <span>Rango 52 semanas</span>
                    <strong>
                      {usd(signal.range52Low ?? NaN)}
                      <em>→</em>
                      {usd(signal.range52High ?? NaN)}
                    </strong>
                  </div>
                  <div className="tv-desk-range__track is-wide" aria-hidden>
                    <i
                      className="tv-desk-range__dot"
                      style={{ left: `${rangePct(signal.price, signal.range52Low ?? NaN, signal.range52High ?? NaN)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <BiasClock
              bias={signal?.bias}
              confidence={signal?.confidence}
              buyVotes={signal?.buyVotes}
              sellVotes={signal?.sellVotes}
            />

          </aside>
        </div>
      </div>
    </div>
  );
}
