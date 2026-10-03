import type { ContabilidadGasto } from "./api";
import {
  monthlyInvoiceCashCollected12,
  yyyyMmFromDate,
  type InvoiceMonthNetRow,
} from "./monitorTripleIngresoKpi";

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

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
}

/** YYYY-MM del mes calendario anterior (pago de hosting = mes siguiente al servicio). */
function previousCalendarYm(ym: string): string | null {
  if (!isYm(ym)) return null;
  const y = Number.parseInt(ym.slice(0, 4), 10);
  const m = Number.parseInt(ym.slice(5, 7), 10);
  const d = new Date(y, m - 2, 1);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mes del gasto para el margen: mes de servicio (el mes cerrado de hosting).
 * P002 y P003 facturan a mes vencido: el presupuesto / pago queda en el mes siguiente.
 * Si mes de servicio falta o coincide con el de presupuesto, se usa el mes anterior al pago.
 */
export function hostingGastoYm(g: Pick<ContabilidadGasto, "presupuestoMes" | "mesServicio" | "fecha">): string | null {
  const ms = String(g.mesServicio ?? "").trim().slice(0, 7);
  const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
  if (isYm(ms) && (!isYm(pm) || ms !== pm)) return ms;
  if (isYm(pm)) return previousCalendarYm(pm) ?? pm;
  if (isYm(ms)) return ms;
  const fechaYm = yyyyMmFromDate(g.fecha);
  return fechaYm ? previousCalendarYm(fechaYm) ?? fechaYm : null;
}

export function normalizeHostingSupplierCode(raw: string | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase();
}

export function buildHostingMargenYearSeries(
  year: number,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  gastos: ContabilidadGasto[] | null | undefined,
  supplierNumbers: string[]
): HostingMargenMonth[] {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const ingresos12 = monthlyInvoiceCashCollected12(hostingInvoices, year);
  const codes = supplierNumbers.map(normalizeHostingSupplierCode).filter(Boolean);
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
