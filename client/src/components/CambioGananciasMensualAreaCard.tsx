import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import type { HostingFxOperation } from "../lib/api";
import {
  computeTripleKpiResult,
  monthlyTripleIngresosArrays,
  type InvoiceMonthNetRow,
} from "../lib/monitorTripleIngresoKpi";
import {
  barFillOpacityForMonthFilter,
  chartMonthDataIndex,
  withAlphaHex,
} from "../lib/chartMonthBarHighlight";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";
import type { PresupuestoFilterControl } from "./MonitorGastosMensualCard";

/** Acentos sólidos (KPI + leyenda); barras usan degradados verdes por rubro. */
const ACCENT_CAMBIO = "#059669";
const ACCENT_HOSTING = "#15803d";
const ACCENT_ASIC = "#65a30d";

/** Tres gamas de verde distintas; dentro de cada una, degradé por mes (4×3 como gastos). */
const GREEN_GRADIENT_CAMBIO: readonly [string, string][] = [
  ["#6ee7b7", "#059669"],
  ["#6ee7b7", "#059669"],
  ["#6ee7b7", "#059669"],
  ["#34d399", "#047857"],
  ["#34d399", "#047857"],
  ["#34d399", "#047857"],
  ["#5eead4", "#0d9488"],
  ["#5eead4", "#0d9488"],
  ["#5eead4", "#0d9488"],
  ["#a7f3d0", "#10b981"],
  ["#a7f3d0", "#10b981"],
  ["#a7f3d0", "#10b981"],
];

const GREEN_GRADIENT_HOSTING: readonly [string, string][] = [
  ["#bbf7d0", "#15803d"],
  ["#bbf7d0", "#15803d"],
  ["#bbf7d0", "#15803d"],
  ["#86efac", "#166534"],
  ["#86efac", "#166534"],
  ["#86efac", "#166534"],
  ["#4ade80", "#14532d"],
  ["#4ade80", "#14532d"],
  ["#4ade80", "#14532d"],
  ["#dcfce7", "#15803d"],
  ["#dcfce7", "#15803d"],
  ["#dcfce7", "#15803d"],
];

const GREEN_GRADIENT_ASIC: readonly [string, string][] = [
  ["#d9f99d", "#65a30d"],
  ["#d9f99d", "#65a30d"],
  ["#d9f99d", "#65a30d"],
  ["#bef264", "#4d7c0f"],
  ["#bef264", "#4d7c0f"],
  ["#bef264", "#4d7c0f"],
  ["#a3e635", "#3f6212"],
  ["#a3e635", "#3f6212"],
  ["#a3e635", "#3f6212"],
  ["#ecfccb", "#84cc16"],
  ["#ecfccb", "#84cc16"],
  ["#ecfccb", "#84cc16"],
];

const GREEN_GRADIENT_BY_DATASET = [GREEN_GRADIENT_CAMBIO, GREEN_GRADIENT_HOSTING, GREEN_GRADIENT_ASIC] as const;

function barGradientGreen(
  ctx2d: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number } | undefined,
  monthIndex: number,
  datasetIndex: number,
  opacity: number
) {
  const pairs = GREEN_GRADIENT_BY_DATASET[datasetIndex] ?? GREEN_GRADIENT_CAMBIO;
  const pair = pairs[monthIndex % 12]!;
  const bottom = chartArea?.bottom ?? 300;
  const top = chartArea?.top ?? 0;
  const g = ctx2d.createLinearGradient(0, bottom, 0, top);
  g.addColorStop(0, withAlphaHex(pair[0], opacity));
  g.addColorStop(1, withAlphaHex(pair[1], opacity));
  return g;
}

/** Solo mes abreviado (eje «Ene», «Feb»…), mismo criterio que `MonitorGastosMensualCard`. */
function formatMonthAxisEs(ym: string): string {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return ym;
  const [ys, ms] = t.split("-");
  const y = Number.parseInt(ys, 10);
  const m = Number.parseInt(ms, 10);
  const d = new Date(y, m - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  const raw = d.toLocaleDateString("es-UY", { month: "short" });
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ym;
}

function formatMonthShortEs(ym: string): string {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return ym;
  const [ys, ms] = t.split("-");
  const y = Number.parseInt(ys, 10);
  const m = Number.parseInt(ms, 10);
  const d = new Date(y, m - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  const raw = d.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ym;
}

function CambioKpiTrend({ pct }: { pct: number | null }) {
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

function chartMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Doce meses del año: barras = cambio + cobros hosting + ASIC (misma agregación que el KPI).
 * `chartRangeTitle` tipo «Ene. – Dic. · 2026» para el título de evolución.
 */
function buildMonthlyTripleIngresoChartSeries(
  operations: HostingFxOperation[] | undefined | null,
  invoicesHosting: InvoiceMonthNetRow[] | undefined | null,
  invoicesAsic: InvoiceMonthNetRow[] | undefined | null,
  year: number
): {
  labels: string[];
  cambio: number[];
  hosting: number[];
  asic: number[];
  combined: number[];
  chartRangeTitle: string;
} {
  const keys = chartMonthKeys(year);
  const { cambio, hosting, asic, combined } = monthlyTripleIngresosArrays(
    operations,
    invoicesHosting,
    invoicesAsic,
    year
  );
  const labels = keys.map((ym) => formatMonthAxisEs(ym));
  const chartRangeTitle = `${formatMonthAxisEs(keys[0]!)} – ${formatMonthAxisEs(keys[11]!)} · ${year}`;
  return { labels, cambio, hosting, asic, combined, chartRangeTitle };
}

type Props = {
  operations: HostingFxOperation[];
  invoicesHosting: InvoiceMonthNetRow[];
  invoicesAsic: InvoiceMonthNetRow[];
  /** Años del selector (mismo origen que gastos presupuesto). */
  years: number[];
  presupuestoFilter: PresupuestoFilterControl;
  /** Cuando el período se elige arriba en la página (un solo filtro global). */
  hidePeriodSelectors?: boolean;
  /** Texto bajo el gráfico (fórmula / enlace). */
  chartFootnote?: ReactNode;
};

export function CambioGananciasMensualAreaCard({
  operations = [],
  invoicesHosting = [],
  invoicesAsic = [],
  years,
  presupuestoFilter,
  hidePeriodSelectors,
  chartFootnote = (
    <>
      Cambio: fecha de operación. Hosting y ASIC: <strong>cobros</strong> por mes (recibos según fecha de pago; NC y
      devoluciones según fecha del comprobante). Servicio de abril cobrado en mayo → figura en <strong>mayo</strong>.
      Vista anual completa: el filtro de mes no acorta el gráfico; aplica a los totales de la izquierda.{" "}
      <Link to="/hosting/exchange-operations" className="link-primary link-underline-opacity-75">
        Operaciones de cambio
      </Link>
      .
    </>
  ),
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  const year = presupuestoFilter.year;
  const mesYm = presupuestoFilter.mesYm;
  const setYear = presupuestoFilter.onYearChange;
  const onMesYmChange = presupuestoFilter.onMesYmChange;

  const chartYearSeries = useMemo(
    () => buildMonthlyTripleIngresoChartSeries(operations, invoicesHosting, invoicesAsic, year),
    [operations, invoicesHosting, invoicesAsic, year]
  );

  const triple = useMemo(
    () => computeTripleKpiResult(year, mesYm, operations, invoicesHosting, invoicesAsic),
    [year, mesYm, operations, invoicesHosting, invoicesAsic]
  );

  const highlightMonthIndex = useMemo(
    () => chartMonthDataIndex(mesYm, year),
    [mesYm, year]
  );

  const chartDataKey = `triple-ingreso-bar-${year}-${mesYm ?? "all"}-${chartYearSeries.combined.join(",")}-${chartYearSeries.cambio.join(",")}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();
    chartRef.current = null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const combined = chartYearSeries.combined;
    const cap = combined.length ? Math.max(...combined, 0) : 0;
    const hi = highlightMonthIndex;
    const radiusTop = { topLeft: 10, topRight: 10, bottomLeft: 4, bottomRight: 4 };

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartYearSeries.labels,
        datasets: [
          {
            label: "Cambio",
            data: chartYearSeries.cambio,
            stack: "ing",
            maxBarThickness: 42,
            borderSkipped: false,
            borderRadius: radiusTop,
            order: 0,
            backgroundColor(ctx: { chart: ChartInstance; dataIndex: number; datasetIndex: number }) {
              const chart = ctx.chart;
              const ds = ctx.datasetIndex ?? 0;
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barGradientGreen(chart.ctx, chart.chartArea, ctx.dataIndex, ds, op);
            },
          },
          {
            label: "Cobros hosting",
            data: chartYearSeries.hosting,
            stack: "ing",
            maxBarThickness: 42,
            borderSkipped: false,
            borderRadius: radiusTop,
            order: 1,
            backgroundColor(ctx: { chart: ChartInstance; dataIndex: number; datasetIndex: number }) {
              const chart = ctx.chart;
              const ds = ctx.datasetIndex ?? 1;
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barGradientGreen(chart.ctx, chart.chartArea, ctx.dataIndex, ds, op);
            },
          },
          {
            label: "Cobros ASIC",
            data: chartYearSeries.asic,
            stack: "ing",
            maxBarThickness: 42,
            borderSkipped: false,
            borderRadius: radiusTop,
            order: 2,
            backgroundColor(ctx: { chart: ChartInstance; dataIndex: number; datasetIndex: number }) {
              const chart = ctx.chart;
              const ds = ctx.datasetIndex ?? 2;
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barGradientGreen(chart.ctx, chart.chartArea, ctx.dataIndex, ds, op);
            },
          },
          {
            type: "line",
            label: "Tendencia (total)",
            data: combined,
            yAxisID: "y",
            borderColor: "#14532d",
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: (c) => (Number(c.dataset.data[c.dataIndex]) > 0.005 ? 5 : 0),
            pointHoverRadius: (c) => (Number(c.dataset.data[c.dataIndex]) > 0.005 ? 6 : 0),
            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#14532d",
            pointBorderWidth: 2.5,
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
            align: "end",
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              font: { size: 10 },
              generateLabels(chart: ChartInstance) {
                const solids = [ACCENT_CAMBIO, ACCENT_HOSTING, ACCENT_ASIC];
                return chart.data.datasets
                  .map((ds, i) => {
                    if (i > 2) return null;
                    const fill = solids[i]!;
                    return {
                      text: String(ds.label ?? ""),
                      fillStyle: fill,
                      strokeStyle: fill,
                      lineWidth: 0,
                      hidden: !chart.isDatasetVisible(i),
                      datasetIndex: i,
                      index: i,
                    };
                  })
                  .filter((item): item is NonNullable<typeof item> => item != null);
              },
            },
          },
          tooltip: {
            filter: (item) => item.datasetIndex !== 3,
            callbacks: {
              title(items) {
                const item = items[0];
                if (!item) return "";
                const i = item.dataIndex;
                const lab = item.chart.data.labels?.[i];
                return typeof lab === "string" ? lab : "";
              },
              afterBody(items) {
                const i = items[0]?.dataIndex;
                if (i == null) return [];
                const row = chartYearSeries.combined[i];
                if (row == null) return [];
                return [`Total: ${formatCurrency(Number(row))}`];
              },
              label(ctx) {
                const label = ctx.dataset.label ?? "";
                const v = ctx.parsed.y;
                if (v == null) return label;
                return `${label}: ${formatCurrency(Number(v))}`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false, drawTicks: false },
            ticks: { maxRotation: 0, minRotation: 0, font: { size: 11, weight: 500 }, color: "#64748b" },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            suggestedMax: cap > 0 ? cap * 1.12 : 1,
            ticks: {
              font: { size: 11 },
              color: "#64748b",
              callback(value) {
                const n = Number(value);
                if (!Number.isFinite(n)) return String(value);
                if (n >= 1000) return `${formatCurrencyNumber(n / 1000)}k`;
                return formatCurrencyNumber(n);
              },
            },
            grid: { color: "rgba(148, 163, 184, 0.22)" },
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

  const yearOptions = years.length > 0 ? years : [year];

  return (
    <div className="reportes-dash monitor-financiero-dash">
      <aside className="reportes-dash__kpis">
        <div className="reportes-dash__kpi-head align-items-start flex-column flex-sm-row gap-2">
          <h3 className="reportes-dash__kpi-title mb-0">Cambio + Hosting + ASIC (USD)</h3>
          {!hidePeriodSelectors ? (
            <div className="d-flex flex-wrap gap-2 align-items-center ms-sm-auto">
              <select
                className="reportes-dash__period-select"
                value={year}
                aria-label="Año (fecha de operación)"
                onChange={(e) => {
                  const y = Number.parseInt(e.target.value, 10);
                  setYear(y);
                  presupuestoFilter.onMesYmChange(null);
                }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {String(y)}
                  </option>
                ))}
              </select>
              <select
                className="reportes-dash__period-select"
                value={mesYm ?? ""}
                aria-label="Mes de operación"
                onChange={(e) => {
                  const v = e.target.value;
                  onMesYmChange(v === "" ? null : v);
                }}
              >
                <option value="">Todos los meses</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const ym = `${year}-${String(m).padStart(2, "0")}`;
                  return (
                    <option key={ym} value={ym}>
                      {formatMonthShortEs(ym)}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}
        </div>
        <div
          className="rounded-2 px-2 py-2 mb-2"
          style={{ background: "rgba(37, 99, 235, 0.05)", border: "1px solid rgba(226, 232, 240, 0.95)" }}
        >
          <div className="d-flex justify-content-between align-items-baseline small mb-1 gap-2">
            <span className="text-muted">Ganancia por cambio</span>
            <span className="fw-bold" style={{ color: ACCENT_CAMBIO }}>
              {formatCurrency(triple.totalCambio)}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-baseline small mb-1 gap-2">
            <span className="text-muted">Cobros hosting</span>
            <span className="fw-bold" style={{ color: ACCENT_HOSTING }}>
              {formatCurrency(triple.totalHosting)}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-baseline small gap-2">
            <span className="text-muted">Cobros ASIC</span>
            <span className="fw-bold" style={{ color: ACCENT_ASIC }}>
              {formatCurrency(triple.totalAsic)}
            </span>
          </div>
        </div>
        <div>
          <div className="reportes-dash__kpi-main">{formatCurrency(triple.totalCombined)}</div>
          <CambioKpiTrend pct={triple.pctVsPrev} />
        </div>
        <div className="reportes-dash__kpi-row">
          <div>
            <p className="reportes-dash__kpi-cell-label">{triple.singleMonthMode ? "Importe del mes" : "Promedio mensual"}</p>
            <p className="reportes-dash__kpi-cell-value">
              {triple.singleMonthMode ? formatCurrency(triple.totalCombined) : formatCurrency(triple.avgMonthlyCombined)}
            </p>
          </div>
          <div>
            <p className="reportes-dash__kpi-cell-label">{triple.singleMonthMode ? "Mes seleccionado" : "Mejor mes"}</p>
            <p className="reportes-dash__kpi-cell-value">
              {triple.singleMonthMode
                ? triple.rangeTitle !== "Sin datos"
                  ? triple.rangeTitle
                  : "—"
                : triple.nMonthsWithData
                  ? formatCurrency(triple.bestMonthValue)
                  : "—"}
            </p>
          </div>
        </div>
        <div className="reportes-dash__kpi-foot">
          <span className="reportes-dash__kpi-foot-meses">
            <strong>{triple.nMonthsWithData}</strong>
            <span className="reportes-dash__kpi-foot-meses-label">
              {" "}
              {triple.singleMonthMode ? "mes filtrado" : "meses con datos"}
            </span>
          </span>
          <i
            className="bi bi-calendar3 reportes-dash__kpi-foot-calendar"
            aria-hidden
            title="Meses con suma combinada (cambio + hosting + ASIC)"
          />
        </div>
      </aside>

      <div className="reportes-dash__chart">
        <p className="reportes-dash__chart-title">
          Evolución mensual — Cambio + cobros Hosting + ASIC ({chartYearSeries.chartRangeTitle}) — USD
        </p>
        <p className="text-muted small mb-2 mb-0" style={{ fontSize: "0.7rem", lineHeight: 1.35 }}>
          {chartFootnote}
        </p>
        <div className="reportes-dash__canvas-wrap monitor-financiero-dash__canvas monitor-financiero-dash__canvas--combo">
          <canvas
            ref={canvasRef}
            aria-label="Ingresos mensuales: cambio y cobros hosting y ASIC, en USD"
            role="img"
          />
        </div>
      </div>
    </div>
  );
}
