import type { HostingFxOperation } from "./api";
import { hostingFxOperationProfitUsd } from "./hostingFxOperationProfit";

/** Comprobantes con `month` del período facturado (YYYY-MM). */
export type InvoiceMonthNetRow = { type: string; month: string; total: number };

function normalizeInvoiceMonthKey(mm: string | undefined): string {
  if (!mm || typeof mm !== "string") return "";
  const parts = mm.split("-").map((p) => Number.parseInt(p.trim(), 10));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    const y = parts[0]!;
    const m = Math.max(1, Math.min(12, parts[1]!));
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  return mm.trim();
}

/** Neto Factura − Nota de crédito por mes del comprobante (índice 0 = enero). */
export function monthlyInvoiceNetTotals12(invoices: InvoiceMonthNetRow[] | null | undefined, year: number): number[] {
  const list = Array.isArray(invoices) ? invoices : [];
  const yStr = String(year);
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const totals = keys.map(() => 0);
  for (const inv of list) {
    if (inv.type !== "Factura" && inv.type !== "Nota de Crédito") continue;
    const mk = normalizeInvoiceMonthKey(inv.month);
    if (!/^\d{4}-\d{2}$/.test(mk) || mk.slice(0, 4) !== yStr) continue;
    const mi = keys.indexOf(mk);
    if (mi < 0) continue;
    const amt = Math.abs(Number(inv.total) || 0);
    const delta = inv.type === "Nota de Crédito" ? -amt : amt;
    totals[mi] += delta;
  }
  return totals;
}

/** Ganancia operaciones de cambio por mes calendario (`operationDate`). */
export function monthlyFxProfitTotals12(operations: HostingFxOperation[] | null | undefined, year: number): number[] {
  const ops = Array.isArray(operations) ? operations : [];
  const yStr = String(year);
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const totals = keys.map(() => 0);
  for (const op of ops) {
    const ym = String(op.operationDate ?? "").trim().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || ym.slice(0, 4) !== yStr) continue;
    const mi = keys.indexOf(ym);
    if (mi < 0) continue;
    totals[mi] += hostingFxOperationProfitUsd(op);
  }
  return totals;
}

/**
 * Series mensuales alineadas al año (índice 0 = enero): cambio por fecha de operación;
 * hosting y ASIC por mes del comprobante (neto Factura − NC); `combined` = suma por mes.
 */
export function monthlyTripleIngresosArrays(
  operations: HostingFxOperation[] | null | undefined,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  asicInvoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): { cambio: number[]; hosting: number[]; asic: number[]; combined: number[] } {
  const cambio = monthlyFxProfitTotals12(operations, year);
  const hosting = monthlyInvoiceNetTotals12(hostingInvoices, year);
  const asic = monthlyInvoiceNetTotals12(asicInvoices, year);
  const combined = cambio.map((c, i) => c + hosting[i]! + asic[i]!);
  return { cambio, hosting, asic, combined };
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

function formatMonthShortEsFromKey(ym: string): string {
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

export type TripleKpiResult = {
  totalCambio: number;
  totalHosting: number;
  totalAsic: number;
  totalCombined: number;
  avgMonthlyCombined: number;
  bestMonthValue: number;
  nMonthsWithData: number;
  pctVsPrev: number | null;
  singleMonthMode: boolean;
  rangeTitle: string;
};

const EPS = 0.0005;

/** KPI del panel izquierdo: totales por rubro + métricas sobre la suma mensual combinada. */
export function computeTripleKpiResult(
  year: number,
  mesYm: string | null,
  operations: HostingFxOperation[] | undefined,
  hostingInvoices: InvoiceMonthNetRow[] | undefined,
  asicInvoices: InvoiceMonthNetRow[] | undefined
): TripleKpiResult {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const { cambio: cambio12, hosting: hosting12, asic: asic12, combined } = monthlyTripleIngresosArrays(
    operations,
    hostingInvoices,
    asicInvoices,
    year
  );

  if (mesYm != null && mesYm !== "") {
    const mk = mesYm.trim().slice(0, 7);
    const idx = /^\d{4}-\d{2}$/.test(mk) ? keys.indexOf(mk) : -1;
    const totalCambio = idx >= 0 ? cambio12[idx]! : 0;
    const totalHosting = idx >= 0 ? hosting12[idx]! : 0;
    const totalAsic = idx >= 0 ? asic12[idx]! : 0;
    const totalCombined = totalCambio + totalHosting + totalAsic;
    const prevYm = idx >= 0 ? prevCalendarMonthYm(mk) : null;
    let pctVsPrev: number | null = null;
    if (prevYm != null) {
      const pIdx = keys.indexOf(prevYm);
      const prevCombined = pIdx >= 0 ? combined[pIdx]! : 0;
      if (prevCombined !== 0) pctVsPrev = ((totalCombined - prevCombined) / prevCombined) * 100;
    }
    return {
      totalCambio,
      totalHosting,
      totalAsic,
      totalCombined,
      avgMonthlyCombined: totalCombined,
      bestMonthValue: totalCombined,
      nMonthsWithData: totalCombined > EPS ? 1 : 0,
      pctVsPrev,
      singleMonthMode: true,
      rangeTitle: idx >= 0 ? formatMonthShortEsFromKey(keys[idx]!) : "Sin datos",
    };
  }

  const sumArr = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totalCambio = sumArr(cambio12);
  const totalHosting = sumArr(hosting12);
  const totalAsic = sumArr(asic12);
  const totalCombined = sumArr(combined);
  const avgMonthlyCombined = totalCombined / 12;
  let bestMonthValue = combined[0] ?? 0;
  for (let i = 1; i < 12; i++) {
    if ((combined[i] ?? 0) > bestMonthValue) bestMonthValue = combined[i]!;
  }
  const nMonthsWithData = combined.filter((v) => v > EPS).length;
  let pctVsPrev: number | null = null;
  if (combined.length >= 2) {
    const last = combined[11]!;
    const prev = combined[10]!;
    if (Math.abs(prev) > EPS) pctVsPrev = ((last - prev) / prev) * 100;
  }
  return {
    totalCambio,
    totalHosting,
    totalAsic,
    totalCombined,
    avgMonthlyCombined,
    bestMonthValue,
    nMonthsWithData,
    pctVsPrev,
    singleMonthMode: false,
    rangeTitle: "",
  };
}
