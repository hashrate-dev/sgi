import type { HostingFxOperation, HostingInvoiceTransferCommissionRow } from "./api";

/** Normaliza fecha impresa de factura (DD/MM/YYYY o ISO) a YYYY-MM-DD para comparar con inputs type=date. */
export function invoicePrintedDateToYmd(dateStr: string | undefined | null): string | null {
  const s = String(dateStr ?? "").trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const nums = s.split(/[/\-.]/).map((p) => p.trim()).filter(Boolean);
  if (nums.length === 3) {
    const a = Number(nums[0]);
    const b = Number(nums[1]);
    const c = Number(nums[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && c >= 1900 && c < 2100 && b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      return `${c}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
  }
  return null;
}

export function operationDateYmd(operationDate: string | undefined | null): string {
  const s = String(operationDate ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : s.slice(0, 10);
}

export type HostingHistorialFilterState = {
  clientText: string;
  /** Año `YYYY` o vacío = sin filtro por período */
  periodYear: string;
  /** Mes `01`–`12` o vacío = año completo (solo si hay año) */
  periodMonth: string;
};

/** Convierte año ± mes en rango inclusive YYYY-MM-DD para operaciones y facturas. */
export function hostingPeriodToDateRange(
  periodYear: string,
  periodMonth: string
): { from: string; to: string } | null {
  const y = periodYear.trim();
  if (!y || !/^\d{4}$/.test(y)) return null;
  const yearNum = Number(y);
  if (yearNum < 1900 || yearNum > 2100) return null;
  const m = periodMonth.trim();
  if (m) {
    if (!/^(0[1-9]|1[0-2])$/.test(m)) return null;
    const mi = Number(m);
    if (mi < 1 || mi > 12) return null;
    const lastDay = new Date(yearNum, mi, 0).getDate();
    return {
      from: `${y}-${m}-01`,
      to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function getHostingHistorialDateRange(f: HostingHistorialFilterState): { from: string; to: string } | null {
  return hostingPeriodToDateRange(f.periodYear, f.periodMonth);
}

export function filterHostingFxOperations(ops: HostingFxOperation[], f: HostingHistorialFilterState): HostingFxOperation[] {
  const q = f.clientText.trim().toLowerCase();
  const range = getHostingHistorialDateRange(f);
  const from = range?.from ?? "";
  const to = range?.to ?? "";
  return ops.filter((op) => {
    if (q) {
      const label = `${op.clientCode ?? ""} ${op.clientName ?? ""} ${op.clientLastName ?? ""}`.toLowerCase();
      if (!label.includes(q)) return false;
    }
    const ymd = operationDateYmd(op.operationDate);
    if (from && ymd && ymd < from) return false;
    if (to && ymd && ymd > to) return false;
    if ((from || to) && !ymd) return false;
    return true;
  });
}

export function filterHostingTransferCommissionInvoices(
  rows: HostingInvoiceTransferCommissionRow[],
  f: HostingHistorialFilterState
): HostingInvoiceTransferCommissionRow[] {
  const q = f.clientText.trim().toLowerCase();
  const range = getHostingHistorialDateRange(f);
  const from = range?.from ?? "";
  const to = range?.to ?? "";
  return rows.filter((row) => {
    if (q) {
      const label = String(row.clientName ?? "").toLowerCase();
      if (!label.includes(q)) return false;
    }
    const ymd = invoicePrintedDateToYmd(row.date);
    if (from || to) {
      if (!ymd) return true;
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
    }
    return true;
  });
}

export function sumTransferCommissionUsd(rows: HostingInvoiceTransferCommissionRow[]): number {
  let s = 0;
  for (const row of rows) {
    const v = Number(row.commissionUsd);
    if (Number.isFinite(v)) s += v;
  }
  return s;
}
