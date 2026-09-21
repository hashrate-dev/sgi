import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import { getCryptoNoticiasLivePrices, type CryptoNewsLivePrice, type CryptoNewsSentimentReport } from "../lib/api";
import { buildHorizonTradeSignals, buildMarketLeadRadar } from "../lib/cryptoNewsDeskBriefing";
import { CryptoNoticiasLivePrices } from "./CryptoNoticiasLivePrices";
import { CryptoNoticiasDeskBriefing } from "./CryptoNoticiasDeskBriefing";

type Props = {
  report: CryptoNewsSentimentReport | null;
  loading?: boolean;
};

function scoreTone(score: number): "up" | "down" | "flat" {
  if (score >= 15) return "up";
  if (score <= -15) return "down";
  return "flat";
}

function isPublishedToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const d = new Date(t);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function mixPct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function timeAgoShort(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "hace instantes";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  try {
    return new Date(t).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function CryptoNoticiasSentimentPanel({ report, loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const [prices, setPrices] = useState<CryptoNewsLivePrice[]>([]);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const r = await getCryptoNoticiasLivePrices();
        if (!dead) setPrices(r.items || []);
      } catch {
        if (!dead) setPrices([]);
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 12_000);
    return () => {
      dead = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;

    chartRef.current?.destroy();
    chartRef.current = null;

    const scores = report.chart.scores.map((s) => Number(s) || 0);
    const colors = scores.map((s) =>
      s >= 15 ? "rgba(61, 186, 154, 0.92)" : s <= -15 ? "rgba(239, 100, 100, 0.92)" : "rgba(148, 174, 196, 0.88)"
    );
    const peak = Math.max(0, ...scores.map((s) => Math.abs(s)));
    const yBound = Math.min(100, Math.max(25, Math.ceil((peak + 8) / 5) * 5));

    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: report.chart.labels,
        datasets: [
          {
            label: "Sesgo (−100 a +100)",
            data: scores,
            backgroundColor: colors,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 56,
          },
        ],
      },
      plugins: [
        {
          id: "hrsScoreLabels",
          afterDatasetsDraw(chart) {
            const meta = chart.getDatasetMeta(0);
            const { ctx } = chart;
            ctx.save();
            ctx.font = "700 12px system-ui, sans-serif";
            ctx.textAlign = "center";
            meta.data.forEach((el, i) => {
              const v = scores[i] ?? 0;
              const label = v > 0 ? `+${v}` : `${v}`;
              ctx.fillStyle = v >= 15 ? "#6ee7b7" : v <= -15 ? "#fca5a5" : "#e8eef5";
              ctx.textBaseline = v >= 0 ? "bottom" : "top";
              ctx.fillText(label, el.x, v >= 0 ? el.y - 6 : el.y + 6);
            });
            ctx.restore();
          },
        },
      ],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18, bottom: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = Number(ctx.raw) || 0;
                return `Sesgo ${v > 0 ? `+${v}` : v} (escala −100 a +100)`;
              },
              afterLabel: (ctx) => {
                const i = ctx.dataIndex;
                const pos = report.chart.positivePct[i] ?? 0;
                const neg = report.chart.negativePct[i] ?? 0;
                return `Noticias + ${pos}% · − ${neg}%`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "rgba(232,238,245,0.75)", font: { size: 11, weight: 600 } },
            grid: { display: false },
          },
          y: {
            min: -yBound,
            max: yBound,
            ticks: {
              color: "rgba(232,238,245,0.55)",
              callback: (v) => `${v}`,
            },
            grid: {
              color: (ctx) =>
                ctx.tick.value === 0 ? "rgba(232,238,245,0.32)" : "rgba(255,255,255,0.08)",
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [report]);

  const tradeSignals = useMemo(
    () => (report ? buildHorizonTradeSignals(report, prices) : null),
    [report, prices]
  );
  const radar = useMemo(() => (report ? buildMarketLeadRadar(report, prices) : null), [report, prices]);

  if (loading && !report) {
    return (
      <section className="crypto-news-sentiment hrs-card sgi-glass-panel" aria-busy>
        <p className="text-muted small mb-0">Calculando señal de mercado desde el wire…</p>
      </section>
    );
  }

  if (!report || !tradeSignals) return null;

  const { signal, horizons, drivers } = report;
  const tone = scoreTone(signal.score);
  const gaugePct = Math.round(((signal.score + 100) / 200) * 100);

  return (
    <section className="crypto-news-sentiment hrs-card sgi-glass-panel" aria-label="Señal de mercado HRS">
      <div className="crypto-news-sentiment__head">
        <div>
          <div className="crypto-news-sentiment__kicker">KPI · Señal HRS Wire</div>
          <h2 className="crypto-news-sentiment__title">¿El mercado tiende a subir?</h2>
          <p className="crypto-news-sentiment__lead">
            Índice construido con el tono de todas las noticias del historial (corto 48 h · mediano 14 d · largo
            45 d). No es consejo financiero: mide la narrativa del wire.
          </p>
        </div>
        <div className={`crypto-news-sentiment__signal is-${tone}`}>
          <div className="crypto-news-sentiment__signal-score">{signal.score > 0 ? `+${signal.score}` : signal.score}</div>
          <div className="crypto-news-sentiment__signal-bias">{signal.biasLabel}</div>
          <div className="crypto-news-sentiment__signal-meta">
            Confianza {signal.confidence}% · {signal.momentumLabel}
          </div>
        </div>
      </div>

      <div className="crypto-news-sentiment__gauge" aria-hidden>
        <div className="crypto-news-sentiment__gauge-track">
          <div className="crypto-news-sentiment__gauge-fill" style={{ width: `${gaugePct}%` }} />
          <div className="crypto-news-sentiment__gauge-needle" style={{ left: `${gaugePct}%` }} />
        </div>
        <div className="crypto-news-sentiment__gauge-labels">
          <span>Bajista</span>
          <span>Neutral</span>
          <span>Alcista</span>
        </div>
      </div>

      <p className="crypto-news-sentiment__verdict">{signal.verdict}</p>

      <CryptoNoticiasDeskBriefing report={report} />

      <div className="crypto-news-sentiment__grid">
        <CryptoNoticiasLivePrices />
        <div className="crypto-news-sentiment__chart-wrap">
          {radar ? (
            <div className={`crypto-news-sentiment__radar is-${radar.path === "SUBA" ? "up" : radar.path === "BAJA" ? "down" : "flat"}`}>
              <div className="crypto-news-sentiment__radar-kicker">Adelanto · {radar.setup}</div>
              <div className="crypto-news-sentiment__radar-main">
                <span className="crypto-news-sentiment__radar-pct">{radar.pUp}%</span>
                <span className="crypto-news-sentiment__radar-path">{radar.path}</span>
              </div>
              <p className="crypto-news-sentiment__radar-why">{radar.why}</p>
            </div>
          ) : null}
          <div className="crypto-news-sentiment__chart-kicker">Sesgo por plazo</div>
          <div className="crypto-news-sentiment__chart-canvas">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      <div className="crypto-news-sentiment__horizons">
            {horizons.map((h) => {
              const ht = scoreTone(h.score);
              const meterPct = Math.round(((h.score + 100) / 200) * 100);
              const total = Math.max(h.articles, h.positive + h.negative + h.neutral, 1);
              const rows = [
                { key: "up", label: "Alcistas", count: h.positive, cls: "is-pos" },
                { key: "flat", label: "Neutrales", count: h.neutral, cls: "is-neu" },
                { key: "down", label: "Bajistas", count: h.negative, cls: "is-neg" },
              ] as const;
              const scoredPct = Math.round(Math.min(1, Math.max(0, h.coverage)) * 100);
              const call = tradeSignals[h.id];
              const lead = radar?.[h.id];
              const callCls = call.action === "COMPRAR" ? "is-buy" : call.action === "VENDER" ? "is-sell" : "is-flat";
              const leadCls = lead?.path === "SUBA" ? "is-up" : lead?.path === "BAJA" ? "is-down" : "is-flat";
              return (
                <article
                  key={h.id}
                  className={`crypto-news-sentiment__horizon is-${ht} is-${h.id} ${callCls}`}
                  aria-label={`${h.label}: ${h.biasLabel} ${h.score > 0 ? `+${h.score}` : h.score}. Señal ${call.action}`}
                >
                  <div className="crypto-news-sentiment__horizon-top">
                    <div>
                      <span className="crypto-news-sentiment__horizon-chip">{h.label}</span>
                      <div className="crypto-news-sentiment__horizon-bias">{h.biasLabel}</div>
                    </div>
                    <span className="crypto-news-sentiment__horizon-score">
                      {h.score > 0 ? `+${h.score}` : h.score}
                    </span>
                  </div>
                  <div
                    className="crypto-news-sentiment__horizon-meter"
                    role="meter"
                    aria-valuemin={-100}
                    aria-valuemax={100}
                    aria-valuenow={h.score}
                    aria-label="Índice de sesgo de −100 a +100"
                  >
                    <span className="crypto-news-sentiment__horizon-meter-fill" style={{ width: `${meterPct}%` }} />
                    <span className="crypto-news-sentiment__horizon-meter-mid" />
                  </div>
                  <p className="crypto-news-sentiment__horizon-window">
                    {h.windowLabel} · {h.articles} notas
                    {Number.isFinite(h.coverage) ? ` · ${scoredPct}% puntuadas` : ""}
                  </p>
                  <div className={`crypto-news-sentiment__horizon-call ${callCls}`}>
                    <span className="crypto-news-sentiment__horizon-call-word">{call.action}</span>
                    <span className="crypto-news-sentiment__horizon-call-why">{call.why}</span>
                  </div>
                  {lead ? (
                    <div className={`crypto-news-sentiment__ahead ${leadCls}`}>
                      <div className="crypto-news-sentiment__ahead-pct">
                        <b>{lead.pUp}</b>
                        <span>%</span>
                      </div>
                      <div className="crypto-news-sentiment__ahead-meta">
                        <span className="crypto-news-sentiment__ahead-path">{lead.path}</span>
                        <span className="crypto-news-sentiment__ahead-win">próx. {lead.window}</span>
                      </div>
                      <div className="crypto-news-sentiment__ahead-bar" aria-hidden>
                        <span className="crypto-news-sentiment__ahead-fill" style={{ width: `${lead.pUp}%` }} />
                        <span className="crypto-news-sentiment__ahead-mid" />
                      </div>
                      <p className="crypto-news-sentiment__ahead-why">{lead.why}</p>
                    </div>
                  ) : null}
                  <ul className="crypto-news-sentiment__horizon-mix">
                    {rows.map((row) => (
                      <li key={row.key} className={row.cls}>
                        <span className="crypto-news-sentiment__horizon-mix-lab">{row.label}</span>
                        <span className="crypto-news-sentiment__horizon-mix-n">
                          {mixPct(row.count, total)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
      </div>

      {(drivers.bullish.length > 0 || drivers.bearish.length > 0) && (
        <div className="crypto-news-sentiment__drivers">
          <div>
            <h3 className="crypto-news-sentiment__drivers-title is-up">Impulso alcista</h3>
            <ul>
              {drivers.bullish.length ? (
                drivers.bullish.map((d) => (
                  <li key={`b-${d.id}`}>
                    <span className="crypto-news-sentiment__drv-score">+{d.score}</span>
                    <div className="crypto-news-sentiment__drv-main">
                      <div className="crypto-news-sentiment__drv-meta">
                        {isPublishedToday(d.publishedAt) ? (
                          <span className="crypto-news-today" title="Publicada hoy">
                            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden>
                              <path
                                fill="currentColor"
                                d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10Z"
                              />
                            </svg>
                            Hoy
                          </span>
                        ) : null}
                        {d.publishedAt ? <time dateTime={d.publishedAt}>{timeAgoShort(d.publishedAt)}</time> : null}
                      </div>
                      <span className="crypto-news-sentiment__drv-title">{d.title}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-muted">Sin catalizadores claros</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="crypto-news-sentiment__drivers-title is-down">Presión bajista</h3>
            <ul>
              {drivers.bearish.length ? (
                drivers.bearish.map((d) => (
                  <li key={`r-${d.id}`}>
                    <span className="crypto-news-sentiment__drv-score">{d.score}</span>
                    <div className="crypto-news-sentiment__drv-main">
                      <div className="crypto-news-sentiment__drv-meta">
                        {isPublishedToday(d.publishedAt) ? (
                          <span className="crypto-news-today" title="Publicada hoy">
                            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden>
                              <path
                                fill="currentColor"
                                d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm12 8H5v10h14V10Z"
                              />
                            </svg>
                            Hoy
                          </span>
                        ) : null}
                        {d.publishedAt ? <time dateTime={d.publishedAt}>{timeAgoShort(d.publishedAt)}</time> : null}
                      </div>
                      <span className="crypto-news-sentiment__drv-title">{d.title}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-muted">Sin alertas fuertes</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <p className="crypto-news-sentiment__footnote">
        Muestra: {report.sampleSize} noticias · actualizado{" "}
        {new Date(report.computedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </section>
  );
}
