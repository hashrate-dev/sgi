import type { ContabilidadGasto, HostingFxOperation } from "./api";
import { hostingFxOperationProfitUsd } from "./hostingFxOperationProfit";
import { monthlyHostingCost12 } from "./hostingMargenCost";

/** Fila de comprobante para el monitor de ingresos. */
export type InvoiceMonthNetRow = {
  type: string;
  month: string;
  total: number;
  number?: string;
  /** Recibo: fecha de cobro. */
  paymentDate?: string;
  /** Fecha de emisión (NC, respaldo, Comp. pago ASIC). */
  date?: string;
  id?: string | number;
  relatedInvoiceId?: string | number;
  relatedInvoiceNumber?: string;
  source?: string;
  documentContext?: string;
  marginUsd?: number;
};

/** Comp. pago ASIC (anticipo): cerrado al emitir; no usa Recibo. */
export function isAsicPrepaidCashInvoice(inv: Pick<InvoiceMonthNetRow, "type" | "source" | "documentContext">): boolean {
  if (String(inv.type ?? "").trim() !== "Factura") return false;
  if (String(inv.source ?? "").trim() !== "asic") return false;
  return String(inv.documentContext ?? "").trim() !== "factura";
}

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

/** YYYY-MM desde fecha ISO, DD/MM/YYYY o similar. */
export function yyyyMmFromDate(raw: string | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 7);
  const isoMonth = t.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMonth) {
    const y = isoMonth[1]!;
    const m = Math.max(1, Math.min(12, Number.parseInt(isoMonth[2]!, 10)));
    return `${y}-${String(m).padStart(2, "0")}`;
  }
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

/** Mes calendario para caja: Recibo → fecha de pago; NC → emisión; Comp. pago ASIC → emisión. */
export function cashMonthKeyFromInvoice(inv: InvoiceMonthNetRow): string | null {
  const type = String(inv.type ?? "").trim();
  if (type === "Recibo" || type === "Recibo Devolución") {
    return (
      yyyyMmFromDate(inv.paymentDate) ??
      yyyyMmFromDate(inv.date) ??
      (normalizeInvoiceMonthKey(inv.month) || null)
    );
  }
  if (type === "Nota de Crédito") {
    return yyyyMmFromDate(inv.date) ?? (normalizeInvoiceMonthKey(inv.month) || null);
  }
  if (isAsicPrepaidCashInvoice(inv)) {
    return (
      yyyyMmFromDate(inv.date) ??
      yyyyMmFromDate(inv.paymentDate) ??
      (normalizeInvoiceMonthKey(inv.month) || null)
    );
  }
  return null;
}

function rowIdKey(id: string | number | undefined): string {
  const s = String(id ?? "").trim();
  return s;
}

function findRelatedFactura(list: InvoiceMonthNetRow[], row: InvoiceMonthNetRow): InvoiceMonthNetRow | undefined {
  const rid = rowIdKey(row.relatedInvoiceId);
  const rnum = String(row.relatedInvoiceNumber ?? "").trim();
  if (rid) {
    const byId = list.find((f) => String(f.type) === "Factura" && rowIdKey(f.id) === rid);
    if (byId) return byId;
  }
  if (rnum) {
    return list.find((f) => String(f.type) === "Factura" && String(f.number ?? "").trim() === rnum);
  }
  return undefined;
}

/**
 * Cobros netos por mes calendario (índice 0 = enero):
 * + Recibos (fecha de pago), + Comp. pago ASIC (emisión), − NC y recibos devolución.
 * No cuenta Recibo encima de un Comp. pago (evita doble cobro).
 * No incluye Factura a crédito sin cobro.
 */
export function monthlyInvoiceCashCollected12(
  invoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): number[] {
  const list = Array.isArray(invoices) ? invoices : [];
  const yStr = String(year);
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const totals = keys.map(() => 0);
  for (const inv of list) {
    const type = String(inv.type ?? "").trim();
    const mk = cashMonthKeyFromInvoice(inv);
    if (!mk || !/^\d{4}-\d{2}$/.test(mk) || mk.slice(0, 4) !== yStr) continue;
    const mi = keys.indexOf(mk);
    if (mi < 0) continue;
    const amt = Math.abs(Number(inv.total) || 0);
    if (type === "Recibo") {
      const related = findRelatedFactura(list, inv);
      if (related && isAsicPrepaidCashInvoice(related)) continue;
      totals[mi] += amt;
    } else if (type === "Nota de Crédito" || type === "Recibo Devolución") {
      totals[mi] -= amt;
    } else if (isAsicPrepaidCashInvoice(inv)) {
      totals[mi] += amt;
    }
  }
  return totals;
}

/**
 * Margen y costo ASIC por mes de caja: Comp. pago en emisión;
 * Factura a crédito prorrateada con cada Recibo / NC.
 * El costo solo se toma si la operación tiene margen cargado (|total| − margen).
 */
function monthlyAsicMarginAndCost12(
  invoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): { margin: number[]; cost: number[] } {
  const list = Array.isArray(invoices) ? invoices : [];
  const yStr = String(year);
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const margin = keys.map(() => 0);
  const cost = keys.map(() => 0);

  const add = (mk: string | null, marginDelta: number, costDelta: number) => {
    if (!mk || !/^\d{4}-\d{2}$/.test(mk) || mk.slice(0, 4) !== yStr) return;
    const mi = keys.indexOf(mk);
    if (mi < 0) return;
    if (Number.isFinite(marginDelta) && Math.abs(marginDelta) >= 0.0005) margin[mi] += marginDelta;
    if (Number.isFinite(costDelta) && Math.abs(costDelta) >= 0.0005) cost[mi] += costDelta;
  };

  for (const inv of list) {
    if (!isAsicPrepaidCashInvoice(inv)) continue;
    const m = Number(inv.marginUsd);
    if (!Number.isFinite(m)) continue;
    const totalAbs = Math.abs(Number(inv.total) || 0);
    const marginAbs = Math.abs(m);
    add(cashMonthKeyFromInvoice(inv), marginAbs, Math.max(0, totalAbs - marginAbs));
  }

  for (const inv of list) {
    const type = String(inv.type ?? "").trim();
    if (type !== "Recibo" && type !== "Nota de Crédito") continue;
    const factura = findRelatedFactura(list, inv);
    if (!factura || isAsicPrepaidCashInvoice(factura)) continue;
    const marginRaw = Number(factura.marginUsd);
    const factAbs = Math.abs(Number(factura.total) || 0);
    if (!Number.isFinite(marginRaw) || factAbs < 0.0005) continue;
    const share = Math.abs(Number(inv.total) || 0) / factAbs;
    const marginAbs = Math.abs(marginRaw);
    const costAbs = Math.max(0, factAbs - marginAbs);
    const sign = type === "Recibo" ? 1 : -1;
    const mk = cashMonthKeyFromInvoice(inv);
    add(mk, sign * marginAbs * share, sign * costAbs * share);
  }
  return { margin, cost };
}

export function monthlyAsicOperationMargin12(
  invoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): number[] {
  return monthlyAsicMarginAndCost12(invoices, year).margin;
}

export function monthlyAsicOperationCost12(
  invoices: InvoiceMonthNetRow[] | null | undefined,
  year: number
): number[] {
  return monthlyAsicMarginAndCost12(invoices, year).cost;
}

/** @deprecated Solo devengado (Factura − NC por MES). El monitor usa `monthlyInvoiceCashCollected12`. */
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
 * Series mensuales alineadas al año (índice 0 = enero).
 * Ingresos = cobros hosting + cobros ASIC (caja). Cambio y margen ASIC van aparte.
 */
export function monthlyTripleIngresosArrays(
  operations: HostingFxOperation[] | null | undefined,
  hostingInvoices: InvoiceMonthNetRow[] | null | undefined,
  asicInvoices: InvoiceMonthNetRow[] | null | undefined,
  year: number,
  gastosItems?: ContabilidadGasto[] | null,
  hostingSupplierNumbers?: string[] | null,
  /** Preferir gastos de margin-settings (misma tabla que /hosting/margen). */
  hostingCostItems?: ContabilidadGasto[] | null
): {
  cambio: number[];
  hosting: number[];
  asic: number[];
  asicMargin: number[];
  asicCost: number[];
  hostingCost: number[];
  hostingMargin: number[];
  ingresos: number[];
  margen: number[];
  combined: number[];
} {
  const cambio = monthlyFxProfitTotals12(operations, year);
  const hosting = monthlyInvoiceCashCollected12(hostingInvoices, year);
  const asic = monthlyInvoiceCashCollected12(asicInvoices, year);
  const { margin: asicMargin, cost: asicCost } = monthlyAsicMarginAndCost12(asicInvoices, year);
  const costSrc =
    Array.isArray(hostingCostItems) && hostingCostItems.length > 0 ? hostingCostItems : gastosItems;
  const hostingCost = monthlyHostingCost12(costSrc, year, hostingSupplierNumbers);
  const hostingMargin = hosting.map((h, i) => h - (hostingCost[i] ?? 0));
  const ingresos = hosting.map((h, i) => h + asic[i]!);
  const margen = cambio.map((c, i) => c + asicMargin[i]! + hostingMargin[i]!);
  const combined = ingresos;
  return {
    cambio,
    hosting,
    asic,
    asicMargin,
    asicCost,
    hostingCost,
    hostingMargin,
    ingresos,
    margen,
    combined,
  };
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
  totalAsicMargin: number;
  totalHostingMargin: number;
  totalIngresos: number;
  totalMargen: number;
  totalCombined: number;
  avgMonthlyCombined: number;
  avgMonthlyMargen: number;
  bestMonthValue: number;
  nMonthsWithData: number;
  pctVsPrev: number | null;
  pctVsPrevMargen: number | null;
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
  asicInvoices: InvoiceMonthNetRow[] | undefined,
  gastosItems?: ContabilidadGasto[] | null,
  hostingSupplierNumbers?: string[] | null,
  hostingCostItems?: ContabilidadGasto[] | null
): TripleKpiResult {
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const {
    cambio: cambio12,
    hosting: hosting12,
    asic: asic12,
    asicMargin: asicMargin12,
    hostingMargin: hostingMargin12,
    ingresos,
    margen,
  } = monthlyTripleIngresosArrays(
    operations,
    hostingInvoices,
    asicInvoices,
    year,
    gastosItems,
    hostingSupplierNumbers,
    hostingCostItems
  );

  const pack = (
    totalCambio: number,
    totalHosting: number,
    totalAsic: number,
    totalAsicMargin: number,
    totalHostingMargin: number,
    totalIngresos: number,
    totalMargen: number,
    extra: Omit<
      TripleKpiResult,
      | "totalCambio"
      | "totalHosting"
      | "totalAsic"
      | "totalAsicMargin"
      | "totalHostingMargin"
      | "totalIngresos"
      | "totalMargen"
      | "totalCombined"
    >
  ): TripleKpiResult => ({
    totalCambio,
    totalHosting,
    totalAsic,
    totalAsicMargin,
    totalHostingMargin,
    totalIngresos,
    totalMargen,
    totalCombined: totalIngresos,
    ...extra,
  });

  if (mesYm != null && mesYm !== "") {
    const mk = mesYm.trim().slice(0, 7);
    const idx = /^\d{4}-\d{2}$/.test(mk) ? keys.indexOf(mk) : -1;
    const totalCambio = idx >= 0 ? cambio12[idx]! : 0;
    const totalHosting = idx >= 0 ? hosting12[idx]! : 0;
    const totalAsic = idx >= 0 ? asic12[idx]! : 0;
    const totalAsicMargin = idx >= 0 ? asicMargin12[idx]! : 0;
    const totalHostingMargin = idx >= 0 ? hostingMargin12[idx]! : 0;
    const totalIngresos = totalHosting + totalAsic;
    const totalMargen = totalCambio + totalAsicMargin + totalHostingMargin;
    const prevYm = idx >= 0 ? prevCalendarMonthYm(mk) : null;
    let pctVsPrev: number | null = null;
    let pctVsPrevMargen: number | null = null;
    if (prevYm != null) {
      const pIdx = keys.indexOf(prevYm);
      const prevIng = pIdx >= 0 ? ingresos[pIdx]! : 0;
      const prevMar = pIdx >= 0 ? margen[pIdx]! : 0;
      if (prevIng !== 0) pctVsPrev = ((totalIngresos - prevIng) / prevIng) * 100;
      if (prevMar !== 0) pctVsPrevMargen = ((totalMargen - prevMar) / prevMar) * 100;
    }
    return pack(totalCambio, totalHosting, totalAsic, totalAsicMargin, totalHostingMargin, totalIngresos, totalMargen, {
      avgMonthlyCombined: totalIngresos,
      avgMonthlyMargen: totalMargen,
      bestMonthValue: totalIngresos,
      nMonthsWithData: totalIngresos > EPS || totalMargen > EPS ? 1 : 0,
      pctVsPrev,
      pctVsPrevMargen,
      singleMonthMode: true,
      rangeTitle: idx >= 0 ? formatMonthShortEsFromKey(keys[idx]!) : "Sin datos",
    });
  }

  const sumArr = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totalCambio = sumArr(cambio12);
  const totalHosting = sumArr(hosting12);
  const totalAsic = sumArr(asic12);
  const totalAsicMargin = sumArr(asicMargin12);
  const totalHostingMargin = sumArr(hostingMargin12);
  const totalIngresos = sumArr(ingresos);
  const totalMargen = sumArr(margen);
  const avgMonthlyCombined = totalIngresos / 12;
  const avgMonthlyMargen = totalMargen / 12;
  let bestMonthValue = ingresos[0] ?? 0;
  for (let i = 1; i < 12; i++) {
    if ((ingresos[i] ?? 0) > bestMonthValue) bestMonthValue = ingresos[i]!;
  }
  const nMonthsWithData = ingresos.filter((v, i) => v > EPS || (margen[i] ?? 0) > EPS).length;
  let pctVsPrev: number | null = null;
  let pctVsPrevMargen: number | null = null;
  if (ingresos.length >= 2) {
    const last = ingresos[11]!;
    const prev = ingresos[10]!;
    if (Math.abs(prev) > EPS) pctVsPrev = ((last - prev) / prev) * 100;
    const lastM = margen[11]!;
    const prevM = margen[10]!;
    if (Math.abs(prevM) > EPS) pctVsPrevMargen = ((lastM - prevM) / prevM) * 100;
  }
  return pack(totalCambio, totalHosting, totalAsic, totalAsicMargin, totalHostingMargin, totalIngresos, totalMargen, {
    avgMonthlyCombined,
    avgMonthlyMargen,
    bestMonthValue,
    nMonthsWithData,
    pctVsPrev,
    pctVsPrevMargen,
    singleMonthMode: false,
    rangeTitle: "",
  });
}
