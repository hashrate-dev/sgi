import type { ContabilidadGasto, HostingFxOperation } from "./api";
import { monthlyTripleIngresosArrays, type InvoiceMonthNetRow } from "./monitorTripleIngresoKpi";

const EPS = 0.0005;

export type MonitorResultadoMonth = {
  ym: string;
  label: string;
  ingresos: number;
  gastos: number;
  resultadoUsd: number;
  margenPct: number | null;
};

export type MonitorResultadoKpi = {
  ingresos: number;
  gastos: number;
  resultadoUsd: number;
  margenPct: number | null;
  pctVsPrevResultado: number | null;
  singleMonthMode: boolean;
  rangeTitle: string;
  nMonthsPositive: number;
  nMonthsWithData: number;
  chartRangeTitle: string;
};

function chartMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

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

function prevCalendarMonthYm(ym: string): string | null {
  const t = ym.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(t)) return null;
  const [ys, ms] = t.split("-");
  const y = Number.parseInt(ys, 10);
  const m = Number.parseInt(ms, 10);
  const d = new Date(y, m - 2, 1);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Gastos por mes de presupuesto (`presupuestoMes`), mismo criterio que el gráfico de gastos. */
export function monthlyGastosPresupuesto12(
  items: ContabilidadGasto[] | null | undefined,
  year: number
): number[] {
  const list = Array.isArray(items) ? items : [];
  const keys = chartMonthKeys(year);
  const totals = keys.map(() => 0);
  for (const g of list) {
    const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(pm) || pm.slice(0, 4) !== String(year)) continue;
    const mi = keys.indexOf(pm);
    if (mi < 0) continue;
    totals[mi] += Number.isFinite(g.monto) ? g.monto : 0;
  }
  return totals;
}

/** Ingresos cobrados (cambio + hosting + ASIC) por mes, índice 0 = enero. */
export function monthlyIngresosCombined12(
  operations: HostingFxOperation[] | null | undefined,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  asicInvoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): number[] {
  return monthlyTripleIngresosArrays(operations, hostingInvoices, asicInvoices, year).combined;
}

export function buildMonitorResultadoYearSeries(
  year: number,
  gastosItems: ContabilidadGasto[] | null | undefined,
  operations: HostingFxOperation[] | null | undefined,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  asicInvoices: InvoiceMonthNetRow[] | null | undefined
): MonitorResultadoMonth[] {
  const keys = chartMonthKeys(year);
  const ingresos = monthlyIngresosCombined12(operations, hostingInvoices, asicInvoices, year);
  const gastos = monthlyGastosPresupuesto12(gastosItems, year);
  return keys.map((ym, i) => {
    const ing = ingresos[i] ?? 0;
    const gas = gastos[i] ?? 0;
    const resultadoUsd = ing - gas;
    const margenPct = ing > EPS ? (resultadoUsd / ing) * 100 : null;
    return {
      ym,
      label: formatMonthAxisEs(ym),
      ingresos: ing,
      gastos: gas,
      resultadoUsd,
      margenPct,
    };
  });
}

export function computeMonitorResultadoKpi(
  year: number,
  mesYm: string | null,
  months: MonitorResultadoMonth[]
): MonitorResultadoKpi {
  const chartRangeTitle = `${formatMonthAxisEs(months[0]?.ym ?? `${year}-01`)} – ${formatMonthAxisEs(months[11]?.ym ?? `${year}-12`)} · ${year}`;

  if (mesYm != null && mesYm !== "") {
    const row = months.find((m) => m.ym === mesYm.slice(0, 7));
    const ingresos = row?.ingresos ?? 0;
    const gastos = row?.gastos ?? 0;
    const resultadoUsd = row?.resultadoUsd ?? 0;
    const margenPct = row?.margenPct ?? null;
    let pctVsPrevResultado: number | null = null;
    const prevYm = prevCalendarMonthYm(mesYm);
    if (prevYm) {
      const prev = months.find((m) => m.ym === prevYm);
      if (prev && Math.abs(prev.resultadoUsd) > EPS) {
        pctVsPrevResultado = ((resultadoUsd - prev.resultadoUsd) / Math.abs(prev.resultadoUsd)) * 100;
      }
    }
    return {
      ingresos,
      gastos,
      resultadoUsd,
      margenPct,
      pctVsPrevResultado,
      singleMonthMode: true,
      rangeTitle: formatMonthShortEs(mesYm),
      nMonthsPositive: resultadoUsd > EPS ? 1 : 0,
      nMonthsWithData: ingresos > EPS || gastos > EPS ? 1 : 0,
      chartRangeTitle,
    };
  }

  const ingresos = months.reduce((s, m) => s + m.ingresos, 0);
  const gastos = months.reduce((s, m) => s + m.gastos, 0);
  const resultadoUsd = ingresos - gastos;
  const margenPct = ingresos > EPS ? (resultadoUsd / ingresos) * 100 : null;
  const nMonthsPositive = months.filter((m) => m.resultadoUsd > EPS).length;
  const nMonthsWithData = months.filter((m) => m.ingresos > EPS || m.gastos > EPS).length;
  let pctVsPrevResultado: number | null = null;
  if (months.length >= 2) {
    const last = months[11]!.resultadoUsd;
    const prev = months[10]!.resultadoUsd;
    if (Math.abs(prev) > EPS) pctVsPrevResultado = ((last - prev) / Math.abs(prev)) * 100;
  }
  return {
    ingresos,
    gastos,
    resultadoUsd,
    margenPct,
    pctVsPrevResultado,
    singleMonthMode: false,
    rangeTitle: "",
    nMonthsPositive,
    nMonthsWithData,
    chartRangeTitle,
  };
}
