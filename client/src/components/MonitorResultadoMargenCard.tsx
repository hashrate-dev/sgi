import { useEffect, useMemo, useRef } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import type { ContabilidadGasto, HostingFxOperation } from "../lib/api";
import {
  barFillOpacityForMonthFilter,
  chartMonthDataIndex,
  withAlphaHex,
} from "../lib/chartMonthBarHighlight";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import type { InvoiceMonthNetRow } from "../lib/monitorTripleIngresoKpi";
import {
  buildMonitorResultadoYearSeries,
  computeMonitorResultadoKpi,
} from "../lib/monitorResultadoMensual";
import type { PresupuestoFilterControl } from "./MonitorGastosMensualCard";

const ACCENT_POS = "#15803d";
const ACCENT_NEG = "#dc2626";
const ACCENT_MARGEN = "#2563eb";
const ACCENT_PROMEDIO = "#78716c";

/** Ejes USD y % con el cero en la misma altura visual. */
function dualAxisZeroAligned(
  usdValues: number[],
  pctValues: number[],
  padRatio = 0.14
): { yMin: number; yMax: number; y1Min: number; y1Max: number } {
  const minR = Math.min(...usdValues, 0);
  const maxR = Math.max(...usdValues, 0);
  const padUsd = Math.max(Math.abs(minR), Math.abs(maxR), 500) * padRatio;

  const finitePct = pctValues.filter(Number.isFinite);
  const minP = finitePct.length ? Math.min(...finitePct, 0) : -15;
  const maxP = finitePct.length ? Math.max(...finitePct, 0) : 15;
  const padPct = Math.max(Math.abs(minP), Math.abs(maxP), 8) * padRatio;

  let yMin = minR - (minR < 0 ? padUsd : 0);
  let yMax = maxR + padUsd;
  if (yMin >= 0) yMin = 0;
  if (yMax <= 0) yMax = padUsd;

  let y1Min = minP - (minP < 0 ? padPct : 0);
  let y1Max = maxP + padPct;
  if (y1Min >= 0) y1Min = 0;
  if (y1Max <= 0) y1Max = padPct;

  const zeroFrac = (min: number, max: number) => {
    if (max <= 0) return 1;
    if (min >= 0) return 0;
    return -min / (max - min);
  };

  let fUsd = zeroFrac(yMin, yMax);
  const fPct = zeroFrac(y1Min, y1Max);
  const target = Math.max(fUsd, fPct, 0.08);

  if (fUsd < target && yMax > 0) {
    yMin = (-target * yMax) / (1 - target);
  }
  if (fPct < target && y1Max > 0) {
    y1Min = (-target * y1Max) / (1 - target);
  }

  return { yMin, yMax, y1Min, y1Max };
}

function barGradientResultado(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number } | undefined,
  value: number,
  opacity: number
) {
  const bottom = chartArea?.bottom ?? 300;
  const top = chartArea?.top ?? 0;
  const g = ctx.createLinearGradient(0, value >= 0 ? bottom : top, 0, value >= 0 ? top : bottom);
  const light = value >= 0 ? "#86efac" : "#fca5a5";
  const dark = value >= 0 ? ACCENT_POS : ACCENT_NEG;
  g.addColorStop(0, withAlphaHex(light, opacity));
  g.addColorStop(1, withAlphaHex(dark, opacity));
  return g;
}

function formatMargenPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function ResultadoKpiTrend({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) {
    return (
      <div className="reportes-dash__kpi-trend reportes-dash__kpi-trend--flat">
        <span>vs. mes anterior: —</span>
      </div>
    );
  }
  const up = pct > 0.5;
  const down = pct < -0.5;
  const cls = up ? "reportes-dash__kpi-trend--up" : down ? "reportes-dash__kpi-trend--down" : "reportes-dash__kpi-trend--flat";
  const arrow = up ? "↑" : down ? "↓" : "→";
  return (
    <div className={`reportes-dash__kpi-trend ${cls}`}>
      <span aria-hidden>{arrow}</span>
      <span>
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}% vs. mes anterior
      </span>
    </div>
  );
}

export type MonitorResultadoMargenCardProps = {
  gastosItems: ContabilidadGasto[];
  operations: HostingFxOperation[] | null | undefined;
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined;
  asicInvoices: InvoiceMonthNetRow[] | null | undefined;
  presupuestoFilter: PresupuestoFilterControl;
};

/**
 * Resultado mensual (ingresos cobrados − gastos presupuesto) + margen %.
 * Barras divergentes USD + línea de margen (estándar P&L).
 */
export function MonitorResultadoMargenCard({
  gastosItems,
  operations,
  hostingInvoices,
  asicInvoices,
  presupuestoFilter,
}: MonitorResultadoMargenCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  const year = presupuestoFilter.year;
  const mesYm = presupuestoFilter.mesYm;

  const chartYearSeries = useMemo(
    () => buildMonitorResultadoYearSeries(year, gastosItems, operations, hostingInvoices, asicInvoices),
    [year, gastosItems, operations, hostingInvoices, asicInvoices]
  );

  const kpi = useMemo(
    () => computeMonitorResultadoKpi(year, mesYm, chartYearSeries),
    [year, mesYm, chartYearSeries]
  );

  const highlightMonthIndex = chartMonthDataIndex(mesYm, year);
  const chartDataKey = `${year}|${mesYm ?? ""}|${chartYearSeries.map((m) => m.resultadoUsd).join(",")}`;

  const chartInsights = useMemo(() => {
    let best = chartYearSeries[0];
    let worst = chartYearSeries[0];
    for (const m of chartYearSeries) {
      if (m.resultadoUsd > (best?.resultadoUsd ?? -Infinity)) best = m;
      if (m.resultadoUsd < (worst?.resultadoUsd ?? Infinity)) worst = m;
    }
    const withMovement = chartYearSeries.filter((m) => m.ingresos > 0.005 || m.gastos > 0.005);
    const avgResultado =
      withMovement.length > 0
        ? withMovement.reduce((s, m) => s + m.resultadoUsd, 0) / withMovement.length
        : null;
    const withIngreso = chartYearSeries.filter((m) => m.ingresos > 0.005 && m.margenPct != null);
    const avgMargen =
      withIngreso.length > 0
        ? withIngreso.reduce((s, m) => s + (m.margenPct ?? 0), 0) / withIngreso.length
        : null;
    return { best, worst, avgResultado, avgMargen, nMovement: withMovement.length };
  }, [chartYearSeries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const labels = chartYearSeries.map((m) => m.label);
    const resultados = chartYearSeries.map((m) => m.resultadoUsd);
    const margenes = chartYearSeries.map((m) => (m.margenPct != null ? m.margenPct : NaN));
    const hi = highlightMonthIndex;
    const avgResultado = chartInsights.avgResultado;

    const usdForScale =
      avgResultado != null && Number.isFinite(avgResultado)
        ? [...resultados, avgResultado]
        : resultados;
    const { yMin, yMax, y1Min, y1Max } = dualAxisZeroAligned(usdForScale, margenes);

    const promedioLine =
      avgResultado != null && Number.isFinite(avgResultado)
        ? Array.from({ length: labels.length }, () => avgResultado)
        : null;

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Resultado neto (USD)",
            data: resultados,
            yAxisID: "y",
            maxBarThickness: 40,
            borderSkipped: false,
            borderRadius: 4,
            order: 1,
            backgroundColor(ctx: { dataIndex: number; chart: ChartInstance }) {
              const v = Number(resultados[ctx.dataIndex] ?? 0);
              if (Math.abs(v) <= 0.005) return withAlphaHex("#94a3b8", 0.25);
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barGradientResultado(ctx.chart.ctx, ctx.chart.chartArea, v, op);
            },
          },
          ...(promedioLine
            ? [
                {
                  type: "line" as const,
                  label: "Promedio mensual (USD)",
                  data: promedioLine,
                  yAxisID: "y",
                  borderColor: ACCENT_PROMEDIO,
                  borderWidth: 2,
                  borderDash: [7, 5],
                  tension: 0,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  fill: false,
                  order: 8,
                },
              ]
            : []),
          {
            type: "line",
            label: "Margen sobre ingresos (%)",
            data: margenes,
            yAxisID: "y1",
            borderColor: ACCENT_MARGEN,
            borderWidth: 2.5,
            borderDash: [5, 4],
            tension: 0,
            spanGaps: false,
            pointRadius: (c) => (Number.isFinite(Number(c.dataset.data[c.dataIndex])) ? 5 : 0),
            pointHoverRadius: (c) => (Number.isFinite(Number(c.dataset.data[c.dataIndex])) ? 6 : 0),
            pointBackgroundColor: "#ffffff",
            pointBorderColor: ACCENT_MARGEN,
            pointBorderWidth: 2,
            fill: false,
            order: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        datasets: {
          bar: { categoryPercentage: 0.72, barPercentage: 0.9 },
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "start",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: { size: 10 },
              padding: 14,
              generateLabels(chart: ChartInstance) {
                return chart.data.datasets.map((ds, i) => {
                  const isMargen = String(ds.label ?? "").includes("Margen");
                  const isPromedio = String(ds.label ?? "").includes("Promedio");
                  return {
                    text: String(ds.label ?? ""),
                    fillStyle: isMargen ? ACCENT_MARGEN : isPromedio ? ACCENT_PROMEDIO : ACCENT_POS,
                    strokeStyle: isMargen ? ACCENT_MARGEN : isPromedio ? ACCENT_PROMEDIO : ACCENT_POS,
                    lineWidth: isMargen || isPromedio ? 2 : 0,
                    lineDash: isMargen ? [5, 4] : isPromedio ? [7, 5] : [],
                    hidden: !chart.isDatasetVisible(i),
                    datasetIndex: i,
                    pointStyle: isMargen || isPromedio ? "line" : "rect",
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              title(items) {
                const item = items[0];
                if (!item) return "";
                const i = item.dataIndex;
                const row = chartYearSeries[i];
                return row ? `${row.label} · ${row.ym}` : "";
              },
              beforeBody(items) {
                const i = items[0]?.dataIndex;
                if (i == null) return [];
                const row = chartYearSeries[i];
                if (!row) return [];
                return [
                  `Ingresos (cobros): ${formatCurrency(row.ingresos)}`,
                  `Gastos (presupuesto): ${formatCurrency(row.gastos)}`,
                ];
              },
              afterBody(items) {
                const i = items[0]?.dataIndex;
                if (i == null) return [];
                const row = chartYearSeries[i];
                if (!row) return [];
                return [`Margen: ${formatMargenPct(row.margenPct)}`];
              },
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null || !Number.isFinite(v)) return "";
                if (ctx.dataset.label?.includes("Margen")) {
                  return `Margen: ${Number(v).toFixed(1)}%`;
                }
                if (ctx.dataset.label?.includes("Promedio")) {
                  return `Promedio mensual: ${formatCurrency(Number(v))}`;
                }
                return `Resultado: ${formatCurrency(Number(v))}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 0, minRotation: 0, font: { size: 11, weight: 500 }, color: "#64748b" },
          },
          y: {
            position: "left",
            min: yMin,
            max: yMax,
            title: {
              display: true,
              text: "Resultado neto (USD)",
              font: { size: 10, weight: 600 },
              color: "#64748b",
            },
            ticks: {
              font: { size: 11 },
              color: "#64748b",
              callback(value) {
                const n = Number(value);
                if (!Number.isFinite(n)) return String(value);
                if (Math.abs(n) >= 1000) return `${formatCurrencyNumber(n / 1000)}k`;
                return formatCurrencyNumber(n);
              },
            },
            grid: {
              color: (ctx) => (ctx.tick.value === 0 ? "rgba(15, 23, 42, 0.4)" : "rgba(148, 163, 184, 0.18)"),
              lineWidth: (ctx) => (ctx.tick.value === 0 ? 2 : 1),
            },
            border: { display: false },
          },
          y1: {
            position: "right",
            min: y1Min,
            max: y1Max,
            title: {
              display: true,
              text: "Margen %",
              font: { size: 10, weight: 600 },
              color: ACCENT_MARGEN,
            },
            ticks: {
              font: { size: 11 },
              color: ACCENT_MARGEN,
              callback(value) {
                const n = Number(value);
                if (!Number.isFinite(n)) return String(value);
                return `${n.toFixed(0)}%`;
              },
            },
            grid: { drawOnChartArea: false },
            border: { display: false },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartDataKey, chartYearSeries, highlightMonthIndex, chartInsights.avgResultado]);

  const resultadoColor = kpi.resultadoUsd >= 0 ? ACCENT_POS : ACCENT_NEG;
  const margenColor =
    kpi.margenPct != null && kpi.margenPct >= 0 ? ACCENT_POS : kpi.margenPct != null ? ACCENT_NEG : "#64748b";

  return (
    <div className="reportes-dash monitor-financiero-dash">
      <aside className="reportes-dash__kpis">
        <div className="reportes-dash__kpi-head align-items-start flex-column flex-sm-row gap-2">
          <h3 className="reportes-dash__kpi-title mb-0">Resultado y margen</h3>
        </div>
        <div
          className="rounded-2 px-2 py-2 mb-2"
          style={{ background: "rgba(37, 99, 235, 0.05)", border: "1px solid rgba(226, 232, 240, 0.95)" }}
        >
          <div className="d-flex justify-content-between align-items-baseline small mb-1 gap-2">
            <span className="text-muted">Ingresos (cobros)</span>
            <span className="fw-bold" style={{ color: "#2563eb" }}>
              {formatCurrency(kpi.ingresos)}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-baseline small gap-2">
            <span className="text-muted">Gastos (presupuesto)</span>
            <span className="fw-bold" style={{ color: ACCENT_NEG }}>
              {formatCurrency(kpi.gastos)}
            </span>
          </div>
        </div>
        <div>
          <div className="reportes-dash__kpi-main" style={{ color: resultadoColor }}>
            {formatCurrency(kpi.resultadoUsd)}
          </div>
          <ResultadoKpiTrend pct={kpi.pctVsPrevResultado} />
        </div>
        <div className="reportes-dash__kpi-row">
          <div>
            <p className="reportes-dash__kpi-cell-label">Margen sobre ingresos</p>
            <p className="reportes-dash__kpi-cell-value" style={{ color: margenColor }}>
              {formatMargenPct(kpi.margenPct)}
            </p>
          </div>
          <div>
            <p className="reportes-dash__kpi-cell-label">
              {kpi.singleMonthMode ? "Mes seleccionado" : "Meses con superávit"}
            </p>
            <p className="reportes-dash__kpi-cell-value">
              {kpi.singleMonthMode
                ? kpi.rangeTitle || "—"
                : kpi.nMonthsWithData > 0
                  ? `${kpi.nMonthsPositive} / 12`
                  : "—"}
            </p>
          </div>
        </div>
        <div className="reportes-dash__kpi-foot">
          <span className="reportes-dash__kpi-foot-meses">
            <strong>{kpi.nMonthsWithData}</strong>
            <span className="reportes-dash__kpi-foot-meses-label">
              {" "}
              {kpi.singleMonthMode ? "mes filtrado" : "meses con movimiento"}
            </span>
          </span>
          <i
            className="bi bi-pie-chart reportes-dash__kpi-foot-calendar"
            aria-hidden
            title="Meses con ingresos o gastos en el año"
          />
        </div>
      </aside>

      <div className="reportes-dash__chart">
        <p className="reportes-dash__chart-title">
          Resultado mensual y margen ({kpi.chartRangeTitle})
        </p>
        <div
          className="d-flex flex-wrap gap-2 mb-2"
          style={{ fontSize: "0.72rem" }}
          aria-label="Resumen del gráfico"
        >
          {chartInsights.best && Math.abs(chartInsights.best.resultadoUsd) > 0.005 ? (
            <span
              className="badge rounded-pill fw-normal"
              style={{ background: "rgba(21, 128, 61, 0.12)", color: ACCENT_POS }}
            >
              Mejor: {chartInsights.best.label} {formatCurrency(chartInsights.best.resultadoUsd)}
            </span>
          ) : null}
          {chartInsights.worst && Math.abs(chartInsights.worst.resultadoUsd) > 0.005 ? (
            <span
              className="badge rounded-pill fw-normal"
              style={{ background: "rgba(220, 38, 38, 0.1)", color: ACCENT_NEG }}
            >
              Peor: {chartInsights.worst.label} {formatCurrency(chartInsights.worst.resultadoUsd)}
            </span>
          ) : null}
          {chartInsights.avgResultado != null ? (
            <span
              className="badge rounded-pill fw-normal"
              style={{ background: "rgba(120, 113, 108, 0.15)", color: ACCENT_PROMEDIO }}
            >
              Promedio mensual: {formatCurrency(chartInsights.avgResultado)}
              {chartInsights.nMovement > 0 ? ` (${chartInsights.nMovement} meses)` : ""}
            </span>
          ) : null}
          {chartInsights.avgMargen != null ? (
            <span
              className="badge rounded-pill fw-normal"
              style={{ background: "rgba(37, 99, 235, 0.1)", color: ACCENT_MARGEN }}
            >
              Margen prom. (meses con cobros): {formatMargenPct(chartInsights.avgMargen)}
            </span>
          ) : null}
        </div>
        <p className="text-muted small mb-2 mb-0" style={{ fontSize: "0.7rem", lineHeight: 1.35 }}>
          Barras = resultado neto (ingresos − gastos). Línea gris = promedio mensual del resultado. Línea azul =
          margen % sobre ingresos cobrados. Ingresos por caja; gastos por mes de presupuesto.
        </p>
        <div className="reportes-dash__canvas-wrap monitor-financiero-dash__canvas monitor-financiero-dash__canvas--resultado">
          <canvas
            ref={canvasRef}
            aria-label="Resultado mensual en USD (barras) y margen porcentual (línea)"
            role="img"
          />
        </div>
      </div>
    </div>
  );
}
