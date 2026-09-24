import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate } from "react-router-dom";
import { MercadosNativeChart } from "../components/MercadosNativeChart";
import { PageHeader } from "../components/PageHeader";
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
  { key: "macd", label: "MACD", hint: "Histograma 12/26/9", group: "Momentum" },
  { key: "rsi", label: "RSI", hint: "Sobrecompra / venta", group: "Momentum" },
  { key: "jerry", label: "Jerry Buy Sell", hint: "EARLY · BUY · SELL en cada vela", group: "Señales" },
  { key: "heatmap", label: "Mapa de calor", hint: "Volumen por precio en la vista actual", group: "Volumen" },
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

function biasCopy(bias: BtcTradeSignal["bias"]): { title: string; kicker: string } {
  if (bias === "buy") return { title: "COMPRAR", kicker: "Confluencia alcista" };
  if (bias === "sell") return { title: "VENDER", kicker: "Confluencia bajista" };
  return { title: "ESPERAR", kicker: "Sin alineación suficiente" };
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
        const r = await getBtcTradeSignal({
          symbol: active.binance,
          interval: interval === "LIVE" ? "1" : interval,
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
            <MercadosNativeChart binance={active.binance} interval={interval} studyOn={studyOn} />
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
            </div>
            </div>
          </div>

          <aside className="tv-markets-rail">
            <div className={`tv-desk-signal tv-desk-signal--${signal?.bias ?? "wait"} hrs-card sgi-glass-panel`}>
              <div className="tv-desk-signal__top">
                <span className="tv-desk-signal__badge">{copy.kicker}</span>
                <span className="tv-desk-signal__live">
                  <i aria-hidden />
                  {signalLoading && !signal ? "Leyendo" : "Live"}
                </span>
              </div>
              <div className="tv-desk-signal__title">{signalLoading && !signal ? "LEYENDO…" : copy.title}</div>
              <div className="tv-desk-signal__price">{signal ? usd(signal.price) : "—"}</div>

              <div className="tv-desk-votes" aria-label="Votos de confluencia">
                <div className="tv-desk-votes__item is-buy">
                  <strong>{signal?.buyVotes ?? 0}</strong>
                  <span>Alcistas</span>
                </div>
                <div className="tv-desk-votes__item is-sell">
                  <strong>{signal?.sellVotes ?? 0}</strong>
                  <span>Bajistas</span>
                </div>
                <div className="tv-desk-votes__item is-wait">
                  <strong>{signal?.waitVotes ?? 0}</strong>
                  <span>Neutros</span>
                </div>
              </div>

              <div className="tv-desk-signal__conf-wrap">
                <div className="tv-desk-signal__conf-row">
                  <span>Alineación</span>
                  <strong>{signal ? `${signal.confidence}%` : "—"}</strong>
                </div>
                <div className="tv-desk-signal__conf">
                  <div className="tv-desk-signal__conf-bar" style={{ width: `${signal?.confidence ?? 0}%` }} />
                </div>
              </div>

              <p className="tv-desk-signal__thesis">{signalErr || signal?.thesis || "Calculando…"}</p>
              {signal?.action ? <p className="tv-desk-signal__action">{signal.action}</p> : null}
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
                  <strong>Sin setup</strong>
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
                      style={{ left: `${rangePct(signal.price, signal.rangeDayLow, signal.rangeDayHigh)}%` }}
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
                      style={{ left: `${rangePct(signal.price, signal.range52Low, signal.range52High)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="tv-desk-checks hrs-card sgi-glass-panel">
              <h2>
                Checklist
                <em>{signal?.checks?.length ? `${signal.checks.length} lecturas` : ""}</em>
              </h2>
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
