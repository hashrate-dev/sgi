import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import type { ContabilidadGasto } from "../lib/api";
import {
  barFillOpacityForMonthFilter,
  chartMonthDataIndex,
  withAlphaHex,
} from "../lib/chartMonthBarHighlight";
import { formatCurrency, formatCurrencyNumber } from "../lib/formatCurrency";

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

/** Solo mes abreviado (eje tipo «Ene», «Feb»…) para el año ya elegido. */
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

/** Degradados por trimestre — barras rojas (claro → intenso de abajo arriba). */
const BAR_GRADIENT_PAIRS: readonly [string, string][] = [
  ["#fca5a5", "#dc2626"],
  ["#fca5a5", "#dc2626"],
  ["#fca5a5", "#dc2626"],
  ["#f87171", "#b91c1c"],
  ["#f87171", "#b91c1c"],
  ["#f87171", "#b91c1c"],
  ["#fb7185", "#be123c"],
  ["#fb7185", "#be123c"],
  ["#fb7185", "#be123c"],
  ["#fecaca", "#e11d48"],
  ["#fecaca", "#e11d48"],
  ["#fecaca", "#e11d48"],
];

function barGradientForIndex(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number } | undefined,
  index: number,
  opacity: number
) {
  const pair = BAR_GRADIENT_PAIRS[index % BAR_GRADIENT_PAIRS.length]!;
  const bottom = chartArea?.bottom ?? 300;
  const top = chartArea?.top ?? 0;
  const g = ctx.createLinearGradient(0, bottom, 0, top);
  g.addColorStop(0, withAlphaHex(pair[0], opacity));
  g.addColorStop(1, withAlphaHex(pair[1], opacity));
  return g;
}

/** Años según «Gasto asignado a presupuesto» (YYYY-MM), no según fecha del comprobante. */
export function collectYearsFromPresupuestoItems(items: ContabilidadGasto[]): number[] {
  const s = new Set<number>();
  const yNow = new Date().getFullYear();
  s.add(yNow);
  for (const g of items) {
    const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(pm)) {
      const y = Number.parseInt(pm.slice(0, 4), 10);
      if (Number.isFinite(y)) s.add(y);
    }
  }
  return [...s].sort((a, b) => b - a);
}

/** Filtra por año y, opcionalmente, mes exacto de presupuesto (YYYY-MM). */
export function filterGastosByPresupuestoMes(
  items: ContabilidadGasto[],
  year: number,
  mesYm: string | null
): ContabilidadGasto[] {
  return items.filter((g) => {
    const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(pm)) return false;
    if (Number.parseInt(pm.slice(0, 4), 10) !== year) return false;
    if (mesYm != null && mesYm !== "" && pm !== mesYm) return false;
    return true;
  });
}

function prevPresupuestoYm(ym: string): string | null {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const [ys, ms] = t.split("-");
  const y = Number.parseInt(ys, 10);
  const m = Number.parseInt(ms, 10);
  const d = new Date(y, m - 2, 1);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MonitorKpiTrend({ pct }: { pct: number | null }) {
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

export type PresupuestoFilterControl = {
  year: number;
  /** null = todos los meses del año seleccionado */
  mesYm: string | null;
  onYearChange: (y: number) => void;
  onMesYmChange: (ym: string | null) => void;
};

export type MonitorGastosMensualCardProps = {
  items: ContabilidadGasto[];
  /** Monitor Financiero: filtros sincronizados con resumen y tabla */
  presupuestoFilter?: PresupuestoFilterControl;
  /** Cuando el período se elige arriba en la página (un solo filtro global). */
  hidePeriodSelectors?: boolean;
  /**
   * Ingresos combinados (cambio + hosting + ASIC) para el mismo período que el filtro.
   * Sirve para el % gasto promedio / ingreso promedio mensual.
   */
  totalIngresosCombinedUsd?: number;
};

/**
 * Panel + gráfico estilo Reportes → Hosting.
 * Serie mensual y totales por **presupuestoMes** («Gasto asignado a presupuesto»); importes en USD (`monto`).
 */
export function MonitorGastosMensualCard({
  items,
  presupuestoFilter,
  hidePeriodSelectors,
  totalIngresosCombinedUsd,
}: MonitorGastosMensualCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);

  const years = useMemo(() => collectYearsFromPresupuestoItems(items), [items]);
  const defaultYear = years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[0] ?? new Date().getFullYear();

  const [internalYear, setInternalYear] = useState(defaultYear);

  const year = presupuestoFilter?.year ?? internalYear;
  const mesYm = presupuestoFilter?.mesYm ?? null;
  const setYear = presupuestoFilter?.onYearChange ?? setInternalYear;

  /** Totales por YYYY-MM de presupuesto para el año seleccionado (base común KPI + gráfico). */
  const monthTotalsForYear = useMemo(() => {
    const monthTotals = new Map<string, number>();
    for (const g of items) {
      const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(pm)) continue;
      const y = Number.parseInt(pm.slice(0, 4), 10);
      if (y !== year) continue;
      const add = Number.isFinite(g.monto) ? g.monto : 0;
      monthTotals.set(pm, (monthTotals.get(pm) ?? 0) + add);
    }
    return monthTotals;
  }, [items, year]);

  /** Gráfico de evolución: siempre los 12 meses del año (independiente del filtro por mes). */
  const chartYearSeries = useMemo(() => {
    const fullYearKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const labels = fullYearKeys.map((ym) => formatMonthAxisEs(ym));
    const values = fullYearKeys.map((ym) => monthTotalsForYear.get(ym) ?? 0);
    const maxVal = values.length ? Math.max(...values, 0) : 0;
    const chartRangeTitle = `${formatMonthAxisEs(fullYearKeys[0]!)} – ${formatMonthAxisEs(fullYearKeys[11]!)} · ${year}`;
    return { labels, values, stackCap: maxVal, chartRangeTitle };
  }, [monthTotalsForYear, year]);

  const series = useMemo(() => {
    const monthTotals = monthTotalsForYear;

    const fullYearKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    let keys: string[];
    let labels: string[];
    let values: number[];

    if (mesYm != null && mesYm !== "") {
      keys = [mesYm];
      labels = keys.map((ym) => formatMonthShortEs(ym));
      values = keys.map((ym) => monthTotals.get(ym) ?? 0);
    } else {
      keys = fullYearKeys;
      labels = fullYearKeys.map((ym) => formatMonthAxisEs(ym));
      values = fullYearKeys.map((ym) => monthTotals.get(ym) ?? 0);
    }
    const total = values.reduce((a, b) => a + b, 0);
    const monthsWithData = values.filter((v) => v > 0.005).length;
    const avg =
      mesYm != null && mesYm !== "" ? total : values.length > 0 ? total / values.length : 0;
    const maxVal = values.length ? Math.max(...values, 0) : 0;
    const bestIdx = values.length ? values.indexOf(maxVal) : -1;
    let pctVsPrev: number | null = null;
    if (mesYm != null && mesYm !== "") {
      const prev = prevPresupuestoYm(mesYm);
      if (prev != null) {
        let prevSum = 0;
        for (const g of items) {
          const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
          if (pm !== prev) continue;
          if (Number.isFinite(g.monto)) prevSum += g.monto;
        }
        const cur = values.length ? values[0]! : 0;
        if (prevSum !== 0) pctVsPrev = ((cur - prevSum) / prevSum) * 100;
      }
    } else if (values.length >= 2) {
      const last = values[values.length - 1]!;
      const prev = values[values.length - 2]!;
      if (prev !== 0) pctVsPrev = ((last - prev) / prev) * 100;
    }
    const rangeTitle =
      keys.length === 0
        ? "Sin datos"
        : mesYm != null && mesYm !== ""
          ? formatMonthShortEs(mesYm)
          : keys.length === 1
            ? formatMonthShortEs(keys[0]!)
            : `${formatMonthAxisEs(keys[0]!)} – ${formatMonthAxisEs(keys[keys.length - 1]!)} · ${year}`;

    return {
      keys,
      labels,
      values,
      total,
      nMonths: monthsWithData,
      stackCap: maxVal,
      avg,
      bestValue: bestIdx >= 0 ? values[bestIdx]! : 0,
      bestLabel: bestIdx >= 0 ? labels[bestIdx]! : "—",
      pctVsPrev,
      rangeTitle,
      singleMonthMode: Boolean(mesYm != null && mesYm !== ""),
    };
  }, [monthTotalsForYear, year, mesYm]);

  /** Gasto promedio mensual vs ingreso promedio mensual (ingreso total del período / 12 si es año completo). */
  const pctGastoPromVsIngresoProm = useMemo(() => {
    if (totalIngresosCombinedUsd == null || !Number.isFinite(totalIngresosCombinedUsd)) return null;
    const ingresoPromMensual = series.singleMonthMode ? totalIngresosCombinedUsd : totalIngresosCombinedUsd / 12;
    if (!(ingresoPromMensual > 1e-9)) return null;
    const p = (series.avg / ingresoPromMensual) * 100;
    return Number.isFinite(p) ? p : null;
  }, [totalIngresosCombinedUsd, series.avg, series.singleMonthMode]);

  const highlightMonthIndex = useMemo(
    () => chartMonthDataIndex(mesYm, year),
    [mesYm, year]
  );

  const chartDataKey = `chart-${year}-${mesYm ?? "all"}-${chartYearSeries.labels.join(",")}-${chartYearSeries.values.join(",")}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chartRef.current?.destroy();
    chartRef.current = null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vals = chartYearSeries.values;
    const cap = Math.max(chartYearSeries.stackCap ?? 0, 0);
    const hi = highlightMonthIndex;

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartYearSeries.labels,
        datasets: [
          {
            label: "Gasto (USD)",
            data: vals,
            maxBarThickness: 42,
            borderSkipped: false,
            borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 4, bottomRight: 4 },
            order: 0,
            backgroundColor(ctx: { chart: ChartInstance; dataIndex: number }) {
              const chart = ctx.chart;
              const op = barFillOpacityForMonthFilter(ctx.dataIndex, hi);
              return barGradientForIndex(chart.ctx, chart.chartArea, ctx.dataIndex, op);
            },
          },
          {
            type: "line",
            label: "Tendencia",
            data: vals,
            yAxisID: "y",
            stack: undefined,
            borderColor: "#7f1d1d",
            borderWidth: 2.5,
            tension: 0.35,
            pointRadius: (c) => (Number(c.dataset.data[c.dataIndex]) > 0.005 ? 5 : 0),
            pointHoverRadius: (c) => (Number(c.dataset.data[c.dataIndex]) > 0.005 ? 6 : 0),
            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#7f1d1d",
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
          legend: { display: false },
          tooltip: {
            filter: (item) => item.datasetIndex === 0,
            callbacks: {
              title(items) {
                const item = items[0];
                if (!item) return "";
                const i = item.dataIndex;
                const lab = item.chart.data.labels?.[i];
                return typeof lab === "string" ? lab : "";
              },
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null) return "";
                return formatCurrency(Number(v));
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false, drawTicks: false },
            ticks: { maxRotation: 0, minRotation: 0, font: { size: 11, weight: 500 }, color: "#64748b" },
          },
          y: {
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
  }, [chartDataKey, chartYearSeries.labels, chartYearSeries.values, chartYearSeries.stackCap, highlightMonthIndex]);

  return (
    <div className="reportes-dash monitor-financiero-dash">
      <aside className="reportes-dash__kpis">
        <div className="reportes-dash__kpi-head align-items-start flex-column flex-sm-row gap-2">
          <h3 className="reportes-dash__kpi-title mb-0">Gastos corporativos (USD)</h3>
          {!hidePeriodSelectors ? (
            <div className="d-flex flex-wrap gap-2 align-items-center ms-sm-auto">
              <select
                className="reportes-dash__period-select"
                value={year}
                aria-label="Año del presupuesto"
                onChange={(e) => {
                  const y = Number.parseInt(e.target.value, 10);
                  setYear(y);
                  presupuestoFilter?.onMesYmChange(null);
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {String(y)}
                  </option>
                ))}
              </select>
              {presupuestoFilter ? (
                <select
                  className="reportes-dash__period-select"
                  value={mesYm ?? ""}
                  aria-label="Mes de presupuesto"
                  onChange={(e) => {
                    const v = e.target.value;
                    presupuestoFilter.onMesYmChange(v === "" ? null : v);
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
              ) : null}
            </div>
          ) : null}
        </div>
        {!hidePeriodSelectors ? (
          <p className="text-muted small mb-2 mb-lg-3" style={{ fontSize: "0.78rem", lineHeight: 1.4 }}>
            Los totales de este panel respetan el filtro de mes o por año.
          </p>
        ) : null}
        <div>
          <div className="reportes-dash__kpi-main">{formatCurrency(series.total)}</div>
          <MonitorKpiTrend pct={series.pctVsPrev} />
        </div>
        <div className="reportes-dash__kpi-row">
          <div>
            <p className="reportes-dash__kpi-cell-label">{series.singleMonthMode ? "Importe del mes" : "Promedio mensual"}</p>
            <p className="reportes-dash__kpi-cell-value">
              {series.singleMonthMode ? formatCurrency(series.total) : formatCurrency(series.avg)}
            </p>
          </div>
          <div>
            <p className="reportes-dash__kpi-cell-label">{series.singleMonthMode ? "Mes seleccionado" : "Mejor mes"}</p>
            <p className="reportes-dash__kpi-cell-value">
              {series.singleMonthMode
                ? series.rangeTitle !== "Sin datos"
                  ? series.rangeTitle
                  : "—"
                : series.nMonths
                  ? formatCurrency(series.bestValue)
                  : "—"}
            </p>
          </div>
        </div>
        {totalIngresosCombinedUsd != null ? (
          <div className="pt-2 mt-2 border-top">
            <p className="reportes-dash__kpi-cell-label mb-1">% gasto prom. / ingreso prom.</p>
            <p className="reportes-dash__kpi-cell-value mb-0" title="Gasto promedio mensual ÷ ingreso promedio mensual (Cambio + Hosting + ASIC)">
              {pctGastoPromVsIngresoProm != null ? `${pctGastoPromVsIngresoProm.toFixed(1)} %` : "—"}
            </p>
          </div>
        ) : null}
        <div className="reportes-dash__kpi-foot">
          <span className="reportes-dash__kpi-foot-meses">
            <strong>{series.nMonths}</strong>
            <span className="reportes-dash__kpi-foot-meses-label">
              {" "}
              {series.singleMonthMode ? "mes filtrado" : "meses con datos"}
            </span>
          </span>
          <i className="bi bi-calendar3 reportes-dash__kpi-foot-calendar" aria-hidden title="Meses de presupuesto con gastos en el año" />
        </div>
      </aside>
      <div className="reportes-dash__chart">
        <p className="reportes-dash__chart-title">
          Evolución por mes de presupuesto ({chartYearSeries.chartRangeTitle}) — USD
        </p>
        {mesYm != null && mesYm !== "" ? (
          <p className="text-muted small mb-2 mb-0" style={{ fontSize: "0.7rem", lineHeight: 1.35 }}>
            Vista anual completa: el filtro de mes no acorta este gráfico; sigue aplicando a los importes de la izquierda y al resto del
            monitor.
          </p>
        ) : null}
        <div className="reportes-dash__canvas-wrap monitor-financiero-dash__canvas monitor-financiero-dash__canvas--combo">
          <canvas ref={canvasRef} aria-label="Gráfico de gastos en USD por mes de presupuesto (vista anual)" role="img" />
        </div>
      </div>
    </div>
  );
}
