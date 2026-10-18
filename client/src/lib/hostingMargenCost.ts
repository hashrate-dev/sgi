import type { ContabilidadGasto, HostingMarginGasto } from "./api";

/** Filas de `/api/hosting/margin-settings` listas para el costo de margen (misma fuente que la tabla). */
export function hostingMarginSettingsToCostGastos(
  rows: HostingMarginGasto[] | null | undefined
): ContabilidadGasto[] {
  return (Array.isArray(rows) ? rows : []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    proveedorId: g.proveedorId,
    supplierNumber: g.supplierNumber,
    supplierName: g.supplierName,
    numeroFactura: "",
    descripcion: g.descripcion,
    observaciones: "",
    mesServicio: g.mesServicio,
    presupuestoMes: g.presupuestoMes,
    medioPago: "",
    moneda: (g.moneda as ContabilidadGasto["moneda"]) || "USD",
    monto: g.monto,
    montoOriginal: g.monto,
    tipoCambio: null,
    createdAt: "",
  }));
}

export const DEFAULT_HOSTING_MARGIN_SUPPLIERS = ["P002", "P003"] as const;

function isYm(raw: string): boolean {
  return /^\d{4}-\d{2}$/.test(raw);
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

/**
 * Mes del costo de hosting.
 * El margen del mes es cobros menos lo pagado a Digital Assets o Blunode en ese mes.
 * El mes de servicio suele ser el mes anterior (se paga a mes vencido); el descuento
 * va al mes de presupuesto, que es donde queda asignado el pago.
 * Prioridad: mes de presupuesto, después la fecha del pago, después el mes de servicio.
 */
export function hostingGastoYm(g: Pick<ContabilidadGasto, "presupuestoMes" | "mesServicio" | "fecha">): string | null {
  const pm = String(g.presupuestoMes ?? "").trim().slice(0, 7);
  if (isYm(pm)) return pm;
  const paid = yyyyMmFromDate(g.fecha);
  if (paid) return paid;
  const ms = String(g.mesServicio ?? "").trim().slice(0, 7);
  if (isYm(ms)) return ms;
  return null;
}

/** Digital Assets y Blunode Paraguay: el costo de hosting aunque el código no sea P002/P003. */
export function isNamedHostingInfraSupplier(name: string | undefined): boolean {
  const n = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
  return n.includes("DIGITAL ASSETS") || n.includes("BLUNODE");
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
  g: Pick<ContabilidadGasto, "supplierNumber" | "supplierName">,
  supplierNumbers: string[] | null | undefined
): boolean {
  if (isNamedHostingInfraSupplier(g.supplierName)) return true;
  const codes = hostingSupplierCodes(supplierNumbers);
  const code = normalizeHostingSupplierCode(g.supplierNumber);
  return Boolean(code) && codes.includes(code);
}

/** Costos de proveedores de hosting por mes de presupuesto (índice 0 = enero). */
export function monthlyHostingCost12(
  gastos: ContabilidadGasto[] | null | undefined,
  year: number,
  supplierNumbers: string[] | null | undefined
): number[] {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const totals = keys.map(() => 0);
  for (const g of Array.isArray(gastos) ? gastos : []) {
    if (!isHostingMarginSupplierGasto(g, supplierNumbers)) continue;
    const ym = hostingGastoYm(g);
    if (!ym || ym.slice(0, 4) !== String(year)) continue;
    const mi = keys.indexOf(ym);
    if (mi < 0) continue;
    totals[mi] += Number.isFinite(g.monto) ? g.monto : 0;
  }
  return totals;
}
