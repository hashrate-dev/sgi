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
const ACCENT_MARGEN = "#1d4ed8";

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

function barColorForResultado(value: number, opacity: number): string {
  const base = value >= 0 ? ACCENT_POS : ACCENT_NEG;
  return withAlphaHex(base, opacity);
}

function formatMargenPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export type MonitorResultadoMargenCardProps = {
  gastosItems: ContabilidadGasto[];
  operations: HostingFxOperation[] | null | undefined;
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined;
  asicInvoices: InvoiceMonthNetRow[] | null | undefined;
  presupuestoFilter: PresupuestoFilterControl;
};

/**
 * Resultado mensual (ingresos cobrados − gastos presupuesto) y margen sobre ingresos.
 * Gráfico combo: barras USD + línea de margen %.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const labels = chartYearSeries.map((m) => m.label);
    const resultados = chartYearSeries.map((m) => m.resultadoUsd);
    const margenes = chartYearSeries.map((m) => (m.margenPct != null ? m.margenPct : NaN));
    const hi = highlightMonthIndex;

    const minR = Math.min(...resultados, 0);
    const maxR = Math.max(...resultados, 0);
    const padUsd = Math.max(Math.abs(minR), Math.abs(maxR), 1) * 0.12;
    const maxMargen = Math.max(...margenes.filter(Number.isFinite), 0, 10);
    const minMargen = Math.min(...margenes.filter(Number.isFinite), 0, -10);
    const capMargen = Math.max(Math.abs(maxMargen), Math.abs(minMargen), 15) * 1.2;

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: "Resultado (USD)",
            data: resultados,
            yAxisID: "y",
            borderColor: "#14532d",
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: (c) => (Math.abs(Number(resultados[c.dataIndex] ?? 0)) > 0.005 ? 5 : 0),
            pointHoverRadius: (c) => (Math.abs(Number(resultados[c.dataIndex] ?? 0)) > 0.005 ? 6 : 0),
            pointBackgroundColor: (c) => {
              const v = Number(resultados[c.dataIndex] ?? 0);
              return v >= 0 ? ACCENT_POS : ACCENT_NEG;
            },
            pointBorderColor: (c) => {
              const v = Number(resultados[c.dataIndex] ?? 0);
              return v >= 0 ? ACCENT_POS : ACCENT_NEG;
            },
            pointBorderWidth: 2,
            fill: false,
            order: 10,
          },
          {
            type: "bar",
            label: "Margen sobre ingresos (%)",
            data: margenes,
            yAxisID: "y1",
            maxBarThickness: 44,
            borderSkipped: false,
            borderRadius: 4,
            order: 2,
            backgroundColor(ctx: { dataIndex: number }) {
              const v = Number(margenes[ctx.dataIndex]);
              if (!Number.isFinite(v)) return withAlphaHex("#94a3b8", 0.25);
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barColorForResultado(v, op);
            },
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
            align: "end",
            labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } },
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
              afterBody(items) {
                const i = items[0]?.dataIndex;
                if (i == null) return [];
                const row = chartYearSeries[i];
                if (!row) return [];
                return [
                  `Ingresos (cobros): ${formatCurrency(row.ingresos)}`,
                  `Gastos (presupuesto): ${formatCurrency(row.gastos)}`,
                  `Resultado: ${formatCurrency(row.resultadoUsd)}`,
                  `Margen: ${formatMargenPct(row.margenPct)}`,
                ];
              },
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null || !Number.isFinite(v)) return "";
                if (ctx.dataset.label?.includes("Resultado")) {
                  return `Resultado: ${formatCurrency(Number(v))}`;
                }
                return `Margen: ${Number(v).toFixed(1)}%`;
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
            beginAtZero: false,
            suggestedMin: minR < 0 ? minR - padUsd : 0,
            suggestedMax: maxR > 0 ? maxR + padUsd : padUsd,
            title: {
              display: true,
              text: "Resultado USD",
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
            grid: { color: "rgba(148, 163, 184, 0.22)" },
            border: { display: false },
          },
          y1: {
            position: "right",
            beginAtZero: false,
            suggestedMin: -capMargen,
            suggestedMax: capMargen,
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
  }, [chartDataKey, chartYearSeries, highlightMonthIndex]);

  const resultadoColor = kpi.resultadoUsd >= 0 ? ACCENT_POS : ACCENT_NEG;
  const margenColor =
    kpi.margenPct != null && kpi.margenPct >= 0 ? ACCENT_POS : kpi.margenPct != null ? ACCENT_NEG : "#64748b";

  const chartFootnote =
    "Ingresos = cobros (cambio + hosting + ASIC por fecha de pago). Gastos = suma por mes de presupuesto. Resultado = ingresos − gastos. Margen = resultado ÷ ingresos.";

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
        <p className="text-muted small mb-2 mb-0" style={{ fontSize: "0.7rem", lineHeight: 1.35 }}>
          {chartFootnote}
        </p>
        <div className="reportes-dash__canvas-wrap monitor-financiero-dash__canvas monitor-financiero-dash__canvas--combo">
          <canvas
            ref={canvasRef}
            aria-label="Resultado mensual en USD (línea) y margen porcentual (barras)"
            role="img"
          />
        </div>
      </div>
    </div>
  );
}
