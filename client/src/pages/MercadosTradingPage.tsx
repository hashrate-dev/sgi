import { useEffect, useMemo, useState } from "react";
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
  { id: "BINANCE:BTCUSDT", binance: "BTCUSDT", label: "BTC", name: "Bitcoin", quote: "USDT" },
  { id: "BINANCE:LTCUSDT", binance: "LTCUSDT", label: "LTC", name: "Litecoin", quote: "USDT" },
  { id: "BINANCE:DOGEUSDT", binance: "DOGEUSDT", label: "DOGE", name: "Dogecoin", quote: "USDT" },
  { id: "BINANCE:ZECUSDT", binance: "ZECUSDT", label: "ZEC", name: "Zcash", quote: "USDT" },
] as const;

const INTERVALS = [
  { id: "1", label: "1m" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1h" },
  { id: "240", label: "4h" },
  { id: "D", label: "1D" },
  { id: "W", label: "1S" },
] as const;

const CHART_STUDIES = [
  { id: "MAExp@tv-basicstudies", inputs: { length: 25, source: "close" }, styles: { "plot.color": "#F5C542" } },
  { id: "MAExp@tv-basicstudies", inputs: { length: 50, source: "close" }, styles: { "plot.color": "#26C6DA" } },
  { id: "MAExp@tv-basicstudies", inputs: { length: 200, source: "close" }, styles: { "plot.color": "#EF5350" } },
  { id: "STD;Supertrend" },
  { id: "STD;MACD" },
  { id: "STD;RSI" },
  { id: "STD;Zig_Zag" },
];

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

export function MercadosTradingPage() {
  const { user } = useAuth();
  const canOpen = canUserAccessNavPath(user, PATH);
  const [symbol, setSymbol] = useState<(typeof SYMBOLS)[number]["id"]>("BINANCE:BTCUSDT");
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]["id"]>("60");
  const [signal, setSignal] = useState<BtcTradeSignal | null>(null);
  const [signalErr, setSignalErr] = useState("");
  const [signalLoading, setSignalLoading] = useState(true);
  const active = SYMBOLS.find((s) => s.id === symbol) ?? SYMBOLS[0];

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

  const tapeConfig = useMemo(
    () => ({
      symbols: [
        { proName: "BINANCE:BTCUSDT", title: "Bitcoin" },
        { proName: "BINANCE:ETHUSDT", title: "Ethereum" },
        { proName: "BINANCE:LTCUSDT", title: "Litecoin" },
        { proName: "BINANCE:DOGEUSDT", title: "Dogecoin" },
        { proName: "BINANCE:ZECUSDT", title: "Zcash" },
        { proName: "BINANCE:SOLUSDT", title: "Solana" },
      ],
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "adaptive",
      colorTheme: "dark",
      locale: "es",
    }),
    []
  );

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
      details: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      save_image: true,
      withdateranges: true,
      studies: CHART_STUDIES,
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
    [interval, symbol]
  );

  if (!user || !canOpen) {
    return <Navigate to={sgiHome()} replace />;
  }

  const copy = signal ? biasCopy(signal.bias) : { title: "…", kicker: "Calculando confluencia" };

  return (
    <div className="fact-page tv-markets-page">
      <div className="container-fluid tv-markets-shell">
        <PageHeader title="Monitor BTC" showBackButton backTo="/gestion-administrativa" backText="Volver atrás" />

        <div className="tv-markets-tape hrs-card sgi-glass-panel">
          <TradingViewEmbed
            scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
            config={tapeConfig}
            className="tv-markets-tape__embed"
          />
        </div>

        <section className="tv-markets-hero hrs-card sgi-glass-panel">
          <div className="tv-markets-hero__copy">
            <div className="tv-markets-kicker">
              <span className="tv-markets-live" aria-hidden />
              Escritorio de operación · velas en vivo · UTC
            </div>
            <h1 className="tv-markets-hero__title">
              {active.name}{" "}
              <span>
                {active.label}/{active.quote}
              </span>
            </h1>
            <p className="tv-markets-hero__lead">
              Señal de compra/venta por confluencia: EMA 25·50·200, Supertrend, MACD, RSI y ZigZag. El gráfico es para
              ejecutar; el panel derecho dice si hay alineación.
            </p>
          </div>
          <div className="tv-markets-hero__controls">
            <div className="tv-markets-chips" role="tablist" aria-label="Par">
              {SYMBOLS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === symbol}
                  className={`tv-markets-chip${s.id === symbol ? " is-on" : ""}`}
                  onClick={() => setSymbol(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="tv-markets-chips tv-markets-chips--compact" role="tablist" aria-label="Intervalo">
              {INTERVALS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="tab"
                  aria-selected={it.id === interval}
                  className={`tv-markets-chip${it.id === interval ? " is-on" : ""}`}
                  onClick={() => setInterval(it.id)}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="tv-markets-desk">
          <div className="tv-markets-chart hrs-card sgi-glass-panel">
            <TradingViewEmbed
              scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
              config={chartConfig}
              className="tv-markets-chart__embed"
            />
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

            {signal ? (
              <div className="tv-desk-levels hrs-card sgi-glass-panel">
                <div>
                  <span>Entrada</span>
                  <strong>{usd(signal.price)}</strong>
                </div>
                <div>
                  <span>Stop / invalida</span>
                  <strong>{usd(signal.stop)}</strong>
                </div>
                <div>
                  <span>T1 · {signal.rr1.toFixed(1)}R</span>
                  <strong>{usd(signal.target1)}</strong>
                </div>
                <div>
                  <span>T2</span>
                  <strong>{usd(signal.target2)}</strong>
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

            <p className="tv-desk-disclaimer">
              Confluencia técnica de escritorio interno. No es consejo de inversión ni garantiza resultado. Operá con
              tamaño de riesgo propio.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
