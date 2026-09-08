import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import type { CryptoNewsSentimentReport } from "../lib/api";
import { CryptoNoticiasLivePrices } from "./CryptoNoticiasLivePrices";

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;

    chartRef.current?.destroy();
    chartRef.current = null;

    const scores = report.chart.scores;
    const colors = scores.map((s) =>
      s >= 15 ? "rgba(61, 186, 154, 0.88)" : s <= -15 ? "rgba(239, 100, 100, 0.88)" : "rgba(180, 190, 200, 0.55)"
    );

    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels: report.chart.labels,
        datasets: [
          {
            label: "Sesgo del wire (−100 bajista · +100 alcista)",
            data: scores,
            backgroundColor: colors,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
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
            min: -100,
            max: 100,
            ticks: {
              color: "rgba(232,238,245,0.55)",
              callback: (v) => `${v}`,
            },
            grid: { color: "rgba(255,255,255,0.08)" },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [report]);

  if (loading && !report) {
    return (
      <section className="crypto-news-sentiment hrs-card sgi-glass-panel" aria-busy>
        <p className="text-muted small mb-0">Calculando señal de mercado desde el wire…</p>
      </section>
    );
  }

  if (!report) return null;

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

      <div className="crypto-news-sentiment__grid">
        <CryptoNoticiasLivePrices />
        <div className="crypto-news-sentiment__mid">
          <div className="crypto-news-sentiment__horizons">
            {horizons.map((h) => {
              const ht = scoreTone(h.score);
              return (
                <div key={h.id} className={`crypto-news-sentiment__horizon is-${ht}`}>
                  <div className="crypto-news-sentiment__horizon-top">
                    <span className="crypto-news-sentiment__horizon-label">{h.label}</span>
                    <span className="crypto-news-sentiment__horizon-score">
                      {h.score > 0 ? `+${h.score}` : h.score}
                    </span>
                  </div>
                  <div className="crypto-news-sentiment__horizon-bias">{h.biasLabel}</div>
                  <div className="crypto-news-sentiment__horizon-meta">
                    {h.windowLabel} · {h.articles} notas · +{h.positive} / −{h.negative}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="crypto-news-sentiment__chart-wrap">
            <canvas ref={canvasRef} />
          </div>
        </div>
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
