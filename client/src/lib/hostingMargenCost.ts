import type { ContabilidadGasto } from "./api";

export const DEFAULT_HOSTING_MARGIN_SUPPLIERS = ["P002", "P003"] as const;

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
}

function previousCalendarYm(ym: string): string | null {
  if (!isYm(ym)) return null;
  const y = Number.parseInt(ym.slice(0, 4), 10);
  const m = Number.parseInt(ym.slice(5, 7), 10);
  const d = new Date(y, m - 2, 1);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yyyyMmFromDate(raw: string | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 7);
  if (isYm(t.slice(0, 7))) return t.slice(0, 7);
  const slash = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const m = Math.max(1, Math.min(12, Number.parseInt(slash[2]!, 10)));
    return `${slash[3]}-${String(m).padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

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

export function hostingSupplierCodes(supplierNumbers: string[] | null | undefined): string[] {
  const src = supplierNumbers?.length ? supplierNumbers : [...DEFAULT_HOSTING_MARGIN_SUPPLIERS];
  return src.map(normalizeHostingSupplierCode).filter(Boolean);
}

export function isHostingMarginSupplierGasto(
  g: Pick<ContabilidadGasto, "supplierNumber">,
  supplierNumbers: string[] | null | undefined
): boolean {
  const codes = hostingSupplierCodes(supplierNumbers);
  const code = normalizeHostingSupplierCode(g.supplierNumber);
  return Boolean(code) && codes.includes(code);
}

/** Costos de proveedores de hosting por mes de servicio (índice 0 = enero). */
export function monthlyHostingCost12(
  gastos: ContabilidadGasto[] | null | undefined,
  year: number,
  supplierNumbers: string[] | null | undefined
): number[] {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const codes = hostingSupplierCodes(supplierNumbers);
  const totals = keys.map(() => 0);
  for (const g of Array.isArray(gastos) ? gastos : []) {
    const code = normalizeHostingSupplierCode(g.supplierNumber);
    if (!codes.includes(code)) continue;
    const ym = hostingGastoYm(g);
    if (!ym || ym.slice(0, 4) !== String(year)) continue;
    const mi = keys.indexOf(ym);
    if (mi < 0) continue;
    totals[mi] += Number.isFinite(g.monto) ? g.monto : 0;
  }
  return totals;
}
