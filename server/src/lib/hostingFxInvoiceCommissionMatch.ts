/** Misma normalización que `FacturacionPage.normalizeClientName` (factura ↔ clients.name). */
export function normalizeHostingInvoiceClientName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Fecha ISO YYYY-MM-DD de operaciones de cambio. */
export function parseFxOperationDateMs(operationDateYmd: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(operationDateYmd ?? ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const t = Date.UTC(y, mo - 1, d);
  return Number.isFinite(t) ? t : null;
}

/**
 * Interpreta fecha de columna invoices.date (típicamente DD/MM/YYYY hosting).
 * Fallback: YYYY-MM-DD si aparece ese formato primero.
 */
export function parseHostingInvoicePrintedDateMs(dateStr: string | null | undefined): number | null {
  const s = String(dateStr ?? "").trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    const t = Date.UTC(y, mo - 1, d);
    return Number.isFinite(t) ? t : null;
  }
  const nums = s.split(/[/\-.]/).map((p) => p.trim()).filter(Boolean);
  if (nums.length === 3) {
    const a = Number(nums[0]);
    const b = Number(nums[1]);
    const c = Number(nums[2]);
    if ([a, b, c].every((n) => Number.isFinite(n)) && c >= 1900 && c < 2100 && b >= 1 && b <= 12 && a >= 1 && a <= 31) {
      const t = Date.UTC(c, b - 1, a);
      return Number.isFinite(t) ? t : null;
    }
  }
  return null;
}

export type HostingCommissionInvoiceRow = {
  invoiceId: number;
  invoiceNumber: string;
  /** Valor invoices.clientName emitido desde facturación (clients.name típico). */
  invoiceClientRaw: string;
  invoiceDateRaw: string;
  commissionUsd: number;
};

export type FxOpForCommissionAssign = {
  id: number;
  clientNameForInvoiceMatch: string;
  operationDateYmd: string;
};

/** Máximo desfase fecha factura ↔ operación (días calendario). */
const MATCH_WINDOW_MS = 60 * 86400000;

/** Empareja cada factura con una sola operación según menor distancia de fechas por cliente (greedy estable). */
export function assignHostingInvoiceCommissionsToFxOps<
  TO extends FxOpForCommissionAssign & { readonly id: number },
>(ops: readonly TO[], invoices: readonly HostingCommissionInvoiceRow[]): Map<number, HostingCommissionInvoiceRow> {
  const opMs = ops.map((o) => ({
    op: o,
    ms: parseFxOperationDateMs(o.operationDateYmd),
    norm: normalizeHostingInvoiceClientName(o.clientNameForInvoiceMatch),
  }));

  type Pair = {
    delta: number;
    opId: number;
    opMs: number;
    inv: HostingCommissionInvoiceRow;
  };
  const pairs: Pair[] = [];
  for (const row of invoices) {
    const invMs = parseHostingInvoicePrintedDateMs(row.invoiceDateRaw);
    if (invMs == null || row.commissionUsd <= 0) continue;
    const invNorm = normalizeHostingInvoiceClientName(row.invoiceClientRaw);
    for (const meta of opMs) {
      if (!meta.norm || meta.norm !== invNorm) continue;
      if (meta.ms == null) continue;
      const delta = Math.abs(meta.ms - invMs);
      if (delta > MATCH_WINDOW_MS) continue;
      pairs.push({ delta, opId: meta.op.id, opMs: meta.ms!, inv: row });
    }
  }
  pairs.sort((a, b) => {
    if (a.delta !== b.delta) return a.delta - b.delta;
    if (a.inv.invoiceId !== b.inv.invoiceId) return a.inv.invoiceId - b.inv.invoiceId;
    return a.opId - b.opId;
  });

  const out = new Map<number, HostingCommissionInvoiceRow>();
  const usedInvoices = new Set<number>();
  for (const p of pairs) {
    if (usedInvoices.has(p.inv.invoiceId)) continue;
    if (out.has(p.opId)) continue;
    out.set(p.opId, p.inv);
    usedInvoices.add(p.inv.invoiceId);
  }
  return out;
}
