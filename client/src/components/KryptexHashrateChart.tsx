import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";

const STORAGE_KEY_TH = "kryptex_hashrate_th_history";
const STORAGE_KEY_GH = "kryptex_hashrate_gh_history";
const MAX_POINTS = 48;

export type HashratePoint = { timestamp: number; value24h: number; value10m: number };

/** Worker usa TH/s (S21) si hashrate24h contiene TH/s */
export function isWorkerTHs(w: { hashrate24h: string | null }): boolean {
  return (w.hashrate24h ?? "").toUpperCase().includes("TH/S");
}

/** Worker usa GH/s (L7) si hashrate24h contiene GH/s */
export function isWorkerGHs(w: { hashrate24h: string | null }): boolean {
  return (w.hashrate24h ?? "").toUpperCase().includes("GH/S");
}

/** Parsea "165.95 TH/s" a número. Solo para workers TH/s. */
function parseTHs(str: string | null): number {
  if (!str || !str.toUpperCase().includes("TH/S")) return 0;
  const m = str.match(/([\d.]+)\s*TH\/s/i);
  return m ? parseFloat(m[1] ?? "0") : 0;
}

/** Parsea "8.93 GH/s" a número. Solo para workers GH/s. */
function parseGHs(str: string | null): number {
  if (!str || !str.toUpperCase().includes("GH/S")) return 0;
  const m = str.match(/([\d.]+)\s*GH\/s/i);
  return m ? parseFloat(m[1] ?? "0") : 0;
}

/** Parsea hashrate10m a TH/s: "X.XX TH/s" | "X.XX GH/s" | "0.00 H/s" */
function parse10mToTHs(str: string | null): number {
  if (!str) return 0;
  const u = str.toUpperCase();
  if (u.includes("TH/S")) {
    const m = str.match(/([\d.]+)\s*TH\/s/i);
    return m ? parseFloat(m[1] ?? "0") : 0;
  }
  if (u.includes("GH/S")) {
    const m = str.match(/([\d.]+)\s*GH\/s/i);
    return m ? parseFloat(m[1] ?? "0") / 1000 : 0;
  }
  if (u.includes("H/S")) return 0;
  return 0;
}

/** Parsea hashrate10m a GH/s: "X.XX GH/s" | "X.XX TH/s" | "0.00 H/s" */
function parse10mToGHs(str: string | null): number {
  if (!str) return 0;
  const u = str.toUpperCase();
  if (u.includes("GH/S")) {
    const m = str.match(/([\d.]+)\s*GH\/s/i);
    return m ? parseFloat(m[1] ?? "0") : 0;
  }
  if (u.includes("TH/S")) {
    const m = str.match(/([\d.]+)\s*TH\/s/i);
    return m ? parseFloat(m[1] ?? "0") * 1000 : 0;
  }
  if (u.includes("H/S")) return 0;
  return 0;
}

/** Suma hashrate 24h de workers TH/s (S21) */
export function sumWorkersTHs(workers: Array<{ hashrate24h: string | null }>): number {
  return workers.filter(isWorkerTHs).reduce((acc, w) => acc + parseTHs(w.hashrate24h), 0);
}

/** Suma hashrate 24h de workers GH/s (L7) */
export function sumWorkersGHs(workers: Array<{ hashrate24h: string | null }>): number {
  return workers.filter(isWorkerGHs).reduce((acc, w) => acc + parseGHs(w.hashrate24h), 0);
}

/** Suma hashrate 10m de workers TH/s (S21) en TH/s */
export function sumWorkers10mTHs(workers: Array<{ hashrate10m: string | null } & { hashrate24h: string | null }>): number {
  return workers.filter(isWorkerTHs).reduce((acc, w) => acc + parse10mToTHs(w.hashrate10m), 0);
}

/** Suma hashrate 10m de workers GH/s (L7) en GH/s */
export function sumWorkers10mGHs(workers: Array<{ hashrate10m: string | null } & { hashrate24h: string | null }>): number {
  return workers.filter(isWorkerGHs).reduce((acc, w) => acc + parse10mToGHs(w.hashrate10m), 0);
}

export function loadHashrateHistory(storageKey: string): HashratePoint[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ timestamp: number; value?: number; value24h?: number; value10m?: number }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      timestamp: p.timestamp,
      value24h: p.value24h ?? p.value ?? 0,
      value10m: p.value10m ?? p.value ?? 0,
    }));
  } catch {
    return [];
  }
}

export function saveHashrateHistory(storageKey: string, points: HashratePoint[]): void {
  try {
    const trimmed = points.slice(-MAX_POINTS);
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export { STORAGE_KEY_TH, STORAGE_KEY_GH };

interface KryptexHashrateChartProps {
  history: HashratePoint[];
  currentTotal24h: number;
  currentTotal10m: number;
  unit: "TH/s" | "GH/s";
  title: string;
}

const CHART_COLORS = {
  "TH/s": {
    fill: ["rgba(0, 166, 82, 0.35)", "rgba(0, 166, 82, 0.12)", "rgba(0, 166, 82, 0.02)"],
    line: ["#00a652", "#49f227", "#00cc6e"],
    accent: "#49f227",
  },
  "GH/s": {
    fill: ["rgba(14, 165, 233, 0.35)", "rgba(14, 165, 233, 0.12)", "rgba(14, 165, 233, 0.02)"],
    line: ["#0ea5e9", "#38bdf8", "#7dd3fc"],
    accent: "#38bdf8",
  },
};

export function KryptexHashrateChart({ history, currentTotal24h, currentTotal10m, unit, title }: KryptexHashrateChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const colors = CHART_COLORS[unit];

  useEffect(() => {
    if (!canvasRef.current || history.length < 2) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const gradient10m = ctx.createLinearGradient(0, 0, 0, 300);
    gradient10m.addColorStop(0, "rgba(59, 130, 246, 0.25)");
    gradient10m.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
    gradient10m.addColorStop(1, "rgba(59, 130, 246, 0.02)");

    const gradient24h = ctx.createLinearGradient(0, 0, 0, 300);
    gradient24h.addColorStop(0, colors.fill[0]);
    gradient24h.addColorStop(0.5, colors.fill[1]);
    gradient24h.addColorStop(1, colors.fill[2]);

    const labels = history.map((p) => {
      const d = new Date(p.timestamp);
      return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    });
    const data10m = history.map((p) => Math.round(p.value10m * 100) / 100);
    const data24h = history.map((p) => Math.round(p.value24h * 100) / 100);

    if (chartRef.current) chartRef.current.destroy();

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `Hashrate (10m)`,
            data: data10m,
            fill: true,
            backgroundColor: gradient10m,
            borderColor: "#3b82f6",
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6,
            pointBackgroundColor: "#fff",
            pointBorderColor: "#3b82f6",
            pointBorderWidth: 1,
          },
          {
            label: `Promedio (24h)`,
            data: data24h,
            fill: true,
            backgroundColor: gradient24h,
            borderColor: colors.line[0],
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6,
            pointBackgroundColor: "#fff",
            pointBorderColor: colors.line[0],
            pointBorderWidth: 1,
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
              color: "rgba(45, 93, 70, 0.95)",
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
                return ` ${ctx.dataset.label}: ${typeof v === "number" ? v.toFixed(2) : v} ${unit}`;
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
              callback: (v) => (typeof v === "number" ? `${v} ${unit}` : v),
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
  }, [history, unit]);

  const hasData = history.length >= 2;

  return (
    <div className={`kryptex-chart-wrap kryptex-chart-wrap--${unit === "TH/s" ? "th" : "gh"}`}>
      <div className="kryptex-chart-header">
        <h6 className="kryptex-chart-title">
          <i className="bi bi-graph-up-arrow me-2" />
          {title}
        </h6>
        <div className="kryptex-chart-badges">
          <div className="kryptex-chart-badge kryptex-chart-badge--10m">
            <span className="kryptex-chart-badge-label">10m</span>
            <span className="kryptex-chart-value">{currentTotal10m > 0 ? currentTotal10m.toFixed(1) : "—"}</span>
            <span className="kryptex-chart-unit"> {unit}</span>
          </div>
          <div className="kryptex-chart-badge">
            <span className="kryptex-chart-badge-label">24h</span>
            <span className="kryptex-chart-value">{currentTotal24h > 0 ? currentTotal24h.toFixed(1) : "—"}</span>
            <span className="kryptex-chart-unit"> {unit}</span>
          </div>
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
