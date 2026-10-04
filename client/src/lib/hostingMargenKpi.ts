import type { ContabilidadGasto } from "./api";
import { hostingGastoYm, hostingSupplierCodes, normalizeHostingSupplierCode } from "./hostingMargenCost";
import { monthlyInvoiceCashCollected12, type InvoiceMonthNetRow } from "./monitorTripleIngresoKpi";

export {
  DEFAULT_HOSTING_MARGIN_SUPPLIERS,
  hostingGastoYm,
  isHostingMarginSupplierGasto,
  monthlyHostingCost12,
  normalizeHostingSupplierCode,
} from "./hostingMargenCost";

const EPS = 0.0005;

const MONTH_LABELS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type HostingMargenMonth = {
  ym: string;
  label: string;
  ingresos: number;
  gastos: number;
  margen: number;
  margenPct: number | null;
  gastosBySupplier: Record<string, number>;
};

export type HostingMargenTotals = {
  ingresos: number;
  gastos: number;
  margen: number;
  margenPct: number | null;
};

export function buildHostingMargenYearSeries(
  year: number,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  gastos: ContabilidadGasto[] | null | undefined,
  supplierNumbers: string[]
): HostingMargenMonth[] {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const ingresos12 = monthlyInvoiceCashCollected12(hostingInvoices, year);
  const codes = hostingSupplierCodes(supplierNumbers);
  const gastosByMonth: Array<Record<string, number>> = keys.map(() => {
    const o: Record<string, number> = {};
    for (const c of codes) o[c] = 0;
    return o;
  });

  for (const g of Array.isArray(gastos) ? gastos : []) {
    const code = normalizeHostingSupplierCode(g.supplierNumber);
    if (!codes.includes(code)) continue;
    const ym = hostingGastoYm(g);
    if (!ym || ym.slice(0, 4) !== String(year)) continue;
    const mi = keys.indexOf(ym);
    if (mi < 0) continue;
    const amt = Number.isFinite(g.monto) ? g.monto : 0;
    gastosByMonth[mi]![code] = (gastosByMonth[mi]![code] ?? 0) + amt;
  }

  return keys.map((ym, i) => {
    const ingresos = ingresos12[i] ?? 0;
    const gastosBySupplier = gastosByMonth[i] ?? {};
    const gastosTotal = codes.reduce((acc, c) => acc + (gastosBySupplier[c] ?? 0), 0);
    const margen = ingresos - gastosTotal;
    return {
      ym,
      label: MONTH_LABELS_ES[i] ?? ym,
      ingresos,
      gastos: gastosTotal,
      margen,
      margenPct: ingresos > EPS ? (margen / ingresos) * 100 : null,
      gastosBySupplier,
    };
  });
}

export function hostingMargenTotals(months: HostingMargenMonth[]): HostingMargenTotals {
  const ingresos = months.reduce((a, m) => a + m.ingresos, 0);
  const gastos = months.reduce((a, m) => a + m.gastos, 0);
  const margen = ingresos - gastos;
  return {
    ingresos,
    gastos,
    margen,
    margenPct: ingresos > EPS ? (margen / ingresos) * 100 : null,
  };
}
