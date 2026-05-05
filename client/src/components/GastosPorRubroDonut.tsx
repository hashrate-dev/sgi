import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import { formatCurrency } from "../lib/formatCurrency";
import { MonitorFinancieroSectionHeader } from "./MonitorFinancieroSectionHeader";

const PALETTE = [
  "#22c55e",
  "#fbbf24",
  "#38bdf8",
  "#3b82f6",
  "#a855f7",
  "#f97316",
  "#14b8a6",
  "#ec4899",
];

/** Donut placeholder (sin datos / todo en cero). */
const EMPTY_RING_COLOR = "#d1d5db";

export type RubroSlice = { rubro: string; total: number };

type Props = {
  slices: RubroSlice[];
  totalUsd: number;
  /** Subtítulo bajo el título (formato igual que Gastos por proveedor). */
  subtitle?: ReactNode;
};

/**
 * Donut con segmentos redondeados; el borde entre segmentos coincide con el fondo de la tarjeta (blanco).
 * Sin datos: mismo tamaño de layout, anillo gris y leyenda «Sin datos».
 */
export function GastosPorRubroDonut({
  slices,
  totalUsd,
  subtitle = (
    <>
      Distribución según el <strong>rubro del proveedor</strong> en Proveedores HRS. Importes en USD del período filtrado.
    </>
  ),
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  const chartSlices = useMemo(() => slices.filter((s) => s.total > 0.0005), [slices]);
  const hasData = chartSlices.length > 0;

  const topShare = useMemo(() => {
    if (totalUsd <= 0 || chartSlices.length === 0) return null;
    const top = chartSlices[0]!;
    const pct = (top.total / totalUsd) * 100;
    return { pct, rubro: top.rubro };
  }, [totalUsd, chartSlices]);

  const dataKey = useMemo(
    () =>
      hasData
        ? chartSlices.map((s) => `${s.rubro}:${s.total.toFixed(2)}`).join("|") + `|t:${totalUsd.toFixed(2)}`
        : `empty|t:${totalUsd.toFixed(2)}`,
    [hasData, chartSlices, totalUsd]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();
    chartRef.current = null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!hasData) {
      chartRef.current = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: [""],
          datasets: [
            {
              data: [1],
              backgroundColor: [EMPTY_RING_COLOR],
              borderColor: "#ffffff",
              borderWidth: 6,
              borderRadius: 0,
              hoverOffset: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          animation: false,
          events: [],
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
        },
      });
      return () => {
        chartRef.current?.destroy();
        chartRef.current = null;
      };
    }

    const labels = chartSlices.map((s) => s.rubro);
    const values = chartSlices.map((s) => s.total);
    const bg = PALETTE.map((_, i) => PALETTE[i % PALETTE.length]!);

    chartRef.current = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: bg,
            borderColor: "#ffffff",
            borderWidth: 6,
            borderRadius: 20,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.98)",
            titleColor: "#1e293b",
            bodyColor: "#475569",
            borderColor: "rgba(148, 163, 184, 0.45)",
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label(ctx) {
                const n = Number(ctx.dataset.data[ctx.dataIndex]);
                if (!Number.isFinite(n)) return "";
                const tot = values.reduce((a, b) => a + b, 0);
                const pct = tot > 0 ? ((n / tot) * 100).toFixed(1) : "0";
                return ` ${formatCurrency(n)} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [dataKey, hasData, chartSlices]);

  const legendColors = chartSlices.map((_, i) => PALETTE[i % PALETTE.length]!);

  return (
    <div className={`monitor-financiero-rubro-donut${hasData ? "" : " monitor-financiero-rubro-donut--empty"}`}>
      <MonitorFinancieroSectionHeader variant="card" title="Gastos por rubro (USD)" subtitle={subtitle} />
      <div className="monitor-financiero-rubro-donut__inner">
        <div className="monitor-financiero-rubro-donut__row">
          <div className="monitor-financiero-rubro-donut__chart-col">
            <div className="monitor-financiero-rubro-donut__chart-wrap">
              <canvas ref={canvasRef} aria-label="Gráfico de gastos por rubro" role="img" />
              <div className="monitor-financiero-rubro-donut__center">
                <span className="monitor-financiero-rubro-donut__center-label">Total (USD)</span>
                <span className="monitor-financiero-rubro-donut__center-value">{formatCurrency(totalUsd)}</span>
                {hasData && topShare ? (
                  <span className="monitor-financiero-rubro-donut__center-sub" title={topShare.rubro}>
                    {topShare.pct.toFixed(1)}% · {topShare.rubro.length > 28 ? `${topShare.rubro.slice(0, 26)}…` : topShare.rubro}
                  </span>
                ) : (
                  <span className="monitor-financiero-rubro-donut__center-sub monitor-financiero-rubro-donut__center-sub--muted">
                    Sin datos
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="monitor-financiero-rubro-donut__legend-col">
            {hasData ? (
              <ul className="monitor-financiero-rubro-donut__legend list-unstyled mb-0">
                {chartSlices.map((s, i) => {
                  const pct = totalUsd > 0 ? ((s.total / totalUsd) * 100).toFixed(1) : "0";
                  return (
                    <li key={`${s.rubro}-${i}`} className="monitor-financiero-rubro-donut__legend-row">
                      <span className="monitor-financiero-rubro-donut__legend-dot" style={{ background: legendColors[i] }} />
                      <div className="monitor-financiero-rubro-donut__legend-body">
                        <span className="monitor-financiero-rubro-donut__legend-name">{s.rubro}</span>
                        <span className="monitor-financiero-rubro-donut__legend-meta">
                          {pct}% · {formatCurrency(s.total)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="monitor-financiero-rubro-donut__legend list-unstyled mb-0">
                <li className="monitor-financiero-rubro-donut__legend-row">
                  <span
                    className="monitor-financiero-rubro-donut__legend-dot"
                    style={{ background: EMPTY_RING_COLOR }}
                    aria-hidden
                  />
                  <div className="monitor-financiero-rubro-donut__legend-body">
                    <span className="monitor-financiero-rubro-donut__legend-name monitor-financiero-rubro-donut__legend-name--muted">
                      Sin datos
                    </span>
                    <span className="monitor-financiero-rubro-donut__legend-meta">{formatCurrency(0)}</span>
                  </div>
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
