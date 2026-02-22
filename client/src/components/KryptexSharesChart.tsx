import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

export type SharesPoint = { timestamp: number; value: number };

const MAX_POINTS = 48;

export function loadSharesHistory(storageKey: string): SharesPoint[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ timestamp: number; value?: number }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({ timestamp: p.timestamp, value: p.value ?? 0 }));
  } catch {
    return [];
  }
}

export function saveSharesHistory(storageKey: string, points: SharesPoint[]): void {
  try {
    const trimmed = points.slice(-MAX_POINTS);
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

interface KryptexSharesChartProps {
  history: SharesPoint[];
  currentTotal: number;
  title: string;
  statsUrl?: string;
  /** Datos del gráfico desde Kryptex (prioridad sobre history) */
  sharesChart?: Array<{ timestamp: number; value: number }>;
}

export function KryptexSharesChart({ history, currentTotal, title, statsUrl, sharesChart }: KryptexSharesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = (sharesChart?.length ? sharesChart : history) as SharesPoint[];
  const chartPoints = chartData.length >= 1 ? chartData : [];

  useEffect(() => {
    const points = (sharesChart?.length ? sharesChart : history) as SharesPoint[];
    if (!canvasRef.current || points.length < 1) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const labels = points.map((p) => {
      const d = new Date(p.timestamp);
      return d.toLocaleString("es-AR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    });
    const data = points.map((p) => p.value);

    if (chartRef.current) chartRef.current.destroy();

    const config: ChartConfiguration<"bar"> = {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Shares (24h)",
            data,
            backgroundColor: "rgba(34, 197, 94, 0.85)",
            borderColor: "rgba(34, 197, 94, 1)",
            borderWidth: 1,
            borderRadius: 2,
            barPercentage: 0.85,
            categoryPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              color: "rgba(255,255,255,0.9)",
              usePointStyle: true,
              padding: 16,
            },
          },
          tooltip: {
            backgroundColor: "rgba(45, 93, 70, 0.95)",
            titleColor: "#fff",
            bodyColor: "#e2e8f0",
            padding: 12,
            cornerRadius: 10,
            displayColors: true,
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y ?? 0;
                return ` Shares: ${typeof v === "number" ? v.toLocaleString("es-AR") : v}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: {
              color: "rgba(255,255,255,0.7)",
              maxRotation: 0,
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: { color: "rgba(255,255,255,0.08)" },
            ticks: {
              color: "rgba(255,255,255,0.8)",
              callback: (v) => (typeof v === "number" ? v.toLocaleString("es-AR") : v),
            },
            beginAtZero: true,
          },
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [history, sharesChart]);

  const hasData = chartPoints.length >= 1;

  return (
    <div className="kryptex-chart-wrap kryptex-chart-wrap--gh">
      <div className="kryptex-chart-header">
        <h6 className="kryptex-chart-title">
          <i className="bi bi-bar-chart me-2" />
          {title}
        </h6>
        <div className="kryptex-chart-badges d-flex align-items-center gap-2">
          <div className="kryptex-chart-badge">
            <span className="kryptex-chart-badge-label">Total</span>
            <span className="kryptex-chart-value">{currentTotal > 0 ? currentTotal.toLocaleString("es-AR") : "—"}</span>
          </div>
          {statsUrl && (
            <a
              href={statsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-light border-0 py-1 px-2"
              title="Ver en Kryptex Pool"
            >
              <i className="bi bi-box-arrow-up-right small" />
            </a>
          )}
        </div>
      </div>
      {hasData ? (
        <div className="kryptex-chart-canvas-wrap">
          <canvas ref={canvasRef} />
        </div>
      ) : (
        <div className="kryptex-chart-placeholder">
          <i className="bi bi-bar-chart-line" />
          <p>El gráfico se irá construyendo con cada actualización</p>
          <p className="small text-muted">Actualizá los datos cada pocos minutos para ver la evolución</p>
        </div>
      )}
    </div>
  );
}
